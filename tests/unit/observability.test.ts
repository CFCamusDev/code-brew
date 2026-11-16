import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/node';
import { captureError, flushErrorTracking, initErrorTracking, isErrorTrackingEnabled, redactSecrets, resetErrorTracking, scrubEvent } from '../../src/lib/server/error-tracking';
import { checkHealth, type HealthProbes } from '../../src/lib/server/health';
import { currentRequestId, logger, runWithRequestId, sanitizeRequestId, serializeError } from '../../src/lib/server/logger';

/** Captura lo que el logger escribe en stdout/stderr. */
function captureOutput() {
  const lines: Record<string, any>[] = [];
  const spy = (stream: NodeJS.WriteStream) =>
    vi.spyOn(stream, 'write').mockImplementation((chunk: any) => {
      lines.push(JSON.parse(String(chunk)));
      return true;
    });
  spy(process.stdout);
  spy(process.stderr);
  return lines;
}

describe('logger estructurado', () => {
  beforeEach(() => {
    delete process.env.LOG_LEVEL;
  });
  afterEach(() => vi.restoreAllMocks());

  it('escribe una línea JSON con hora, nivel y mensaje', () => {
    const lines = captureOutput();
    logger.info('hola', { pedido: 7 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', msg: 'hola', pedido: 7 });
    expect(new Date(lines[0].time).toISOString()).toBe(lines[0].time);
  });

  it('respeta LOG_LEVEL (info por defecto: no escribe debug)', () => {
    const lines = captureOutput();
    logger.debug('oculto');
    expect(lines).toHaveLength(0);
    process.env.LOG_LEVEL = 'debug';
    logger.debug('visible');
    expect(lines.map(l => l.msg)).toEqual(['visible']);
    process.env.LOG_LEVEL = 'error';
    logger.warn('no sale');
    logger.error('sí sale');
    expect(lines.map(l => l.msg)).toEqual(['visible', 'sí sale']);
  });

  it('incluye el id de la petición en todos los logs de su alcance', async () => {
    const lines = captureOutput();
    await runWithRequestId('req-12345678', async () => {
      logger.info('uno');
      await Promise.resolve();
      logger.warn('dos');
      expect(currentRequestId()).toBe('req-12345678');
    });
    logger.info('fuera');
    expect(lines.map(l => l.requestId)).toEqual(['req-12345678', 'req-12345678', undefined]);
  });

  it('peticiones simultáneas no mezclan sus ids', async () => {
    const lines = captureOutput();
    await Promise.all(
      ['aaaaaaaa', 'bbbbbbbb'].map(id =>
        runWithRequestId(id, async () => {
          await new Promise(resolve => setTimeout(resolve, id === 'aaaaaaaa' ? 10 : 1));
          logger.info(id);
        })
      )
    );
    for (const line of lines) expect(line.requestId).toBe(line.msg);
  });

  it('serializa errores con nombre, mensaje, stack y causa', () => {
    const lines = captureOutput();
    logger.error('falló', new Error('boom', { cause: new TypeError('raíz') }));
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'falló', error: { name: 'Error', message: 'boom', cause: { name: 'TypeError', message: 'raíz' } } });
    expect(lines[0].error.stack).toContain('boom');
    expect(serializeError('texto')).toEqual({ message: 'texto' });
  });

  it('solo acepta ids entrantes cortos y seguros', () => {
    expect(sanitizeRequestId('0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(sanitizeRequestId('corto')).toBeUndefined();
    expect(sanitizeRequestId('con espacios y "comillas"')).toBeUndefined();
    expect(sanitizeRequestId('a'.repeat(65))).toBeUndefined();
    expect(sanitizeRequestId(null)).toBeUndefined();
  });
});

describe('seguimiento de errores (Sentry)', () => {
  afterEach(async () => {
    await resetErrorTracking();
    vi.restoreAllMocks();
  });

  it('sin DSN queda desactivado y capturar no hace nada', () => {
    expect(initErrorTracking({ dsn: '' })).toBe(false);
    expect(isErrorTrackingEnabled()).toBe(false);
    expect(() => captureError(new Error('x'))).not.toThrow();
  });

  it('quita secretos de textos', () => {
    expect(redactSecrets('POST /api/webhooks/culqi?key=SECRETO123&x=1')).toBe('POST /api/webhooks/culqi?key=[redacted]&x=1');
    expect(redactSecrets('https://a.pe/?a=1&token=abc')).toBe('https://a.pe/?a=1&token=[redacted]');
    expect(redactSecrets('sin secretos')).toBe('sin secretos');
  });

  it('scrubEvent elimina la petición y el usuario, y limpia mensajes, excepciones y contexto', () => {
    const event = {
      request: { url: 'https://x.pe/api/webhooks/culqi?key=SECRETO', cookies: { cb_admin: 'sesion' } },
      user: { ip_address: '1.2.3.4' },
      message: 'fallo en ?key=SECRETO',
      exception: { values: [{ value: 'fetch https://x.pe/?token=SECRETO falló' }] },
      extra: { url: 'https://x.pe/?key=SECRETO', anidado: { texto: '?password=SECRETO' } }
    } as unknown as ErrorEvent;
    const clean = scrubEvent(event);
    expect(JSON.stringify(clean)).not.toContain('SECRETO');
    expect(clean.request).toBeUndefined();
    expect(clean.user).toBeUndefined();
  });

  it('un error capturado se envía con su contexto (requestId, ruta) y sin secretos', async () => {
    const sent: any[] = [];
    const transport = () => ({
      send: async (envelope: any) => {
        sent.push(envelope);
        return {};
      },
      flush: async () => true
    });
    expect(initErrorTracking({ dsn: 'https://publica@o0.ingest.sentry.io/1', environment: 'pruebas', transport: transport as any })).toBe(true);
    captureError(new Error('falló ?key=SECRETO'), { requestId: 'req-12345678', method: 'POST', path: '/api/pedidos' });
    await flushErrorTracking();

    const [, items] = sent[0];
    const event = items[0][1];
    expect(event.environment).toBe('pruebas');
    expect(event.tags.requestId).toBe('req-12345678');
    expect(event.extra).toMatchObject({ method: 'POST', path: '/api/pedidos' });
    expect(event.exception.values[0].value).toBe('falló ?key=[redacted]');
    expect(JSON.stringify(event)).not.toContain('SECRETO');
  });

  it('logger.error envía el error a Sentry con el id de la petición', async () => {
    captureOutput();
    const sent: any[] = [];
    const transport = () => ({ send: async (envelope: any) => (sent.push(envelope), {}), flush: async () => true });
    initErrorTracking({ dsn: 'https://publica@o0.ingest.sentry.io/1', transport: transport as any });
    await runWithRequestId('req-abcdefgh', async () => logger.error('algo falló', new Error('boom'), { orderId: 'o-1' }));
    await flushErrorTracking();
    const event = sent[0][1][0][1];
    expect(event.tags.requestId).toBe('req-abcdefgh');
    expect(event.extra).toMatchObject({ orderId: 'o-1', message: 'algo falló' });
  });
});

describe('health', () => {
  const probes = (overrides: Partial<HealthProbes> = {}): HealthProbes => {
    let clock = 1000;
    return {
      pingDatabase: async () => void (clock += 7),
      appliedMigrations: async () => 11,
      expectedMigrations: () => 11,
      errorTrackingEnabled: () => false,
      now: () => clock,
      ...overrides
    };
  };

  it('todo en orden: base, migraciones y latencia', async () => {
    expect(await checkHealth(probes())).toEqual({ status: 'ok', database: 'ok', migrations: 'ok', errorTracking: 'disabled', databaseLatencyMs: 7 });
  });

  it('base caída: error, sin consultar migraciones', async () => {
    const appliedMigrations = vi.fn();
    const report = await checkHealth(probes({ pingDatabase: async () => { throw new Error('caída'); }, appliedMigrations }));
    expect(report).toMatchObject({ status: 'error', database: 'unavailable', migrations: 'unknown', databaseLatencyMs: null });
    expect(appliedMigrations).not.toHaveBeenCalled();
  });

  it('migraciones pendientes: error (la app no debe recibir tráfico)', async () => {
    expect(await checkHealth(probes({ appliedMigrations: async () => 9 }))).toMatchObject({ status: 'error', database: 'ok', migrations: 'pending' });
  });

  it('más migraciones aplicadas que esperadas (versión anterior) no es un error', async () => {
    expect(await checkHealth(probes({ appliedMigrations: async () => 13 }))).toMatchObject({ status: 'ok', migrations: 'ok' });
  });

  it('si no se puede leer el diario o la tabla de migraciones, "unknown" sin tumbar la app', async () => {
    expect(await checkHealth(probes({ expectedMigrations: () => null }))).toMatchObject({ status: 'ok', migrations: 'unknown' });
    expect(await checkHealth(probes({ appliedMigrations: async () => { throw new Error('sin tabla'); } }))).toMatchObject({ status: 'ok', migrations: 'unknown' });
  });

  it('informa si el seguimiento de errores está activo', async () => {
    expect((await checkHealth(probes({ errorTrackingEnabled: () => true }))).errorTracking).toBe('enabled');
  });
});
