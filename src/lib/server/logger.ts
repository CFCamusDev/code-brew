import { AsyncLocalStorage } from 'node:async_hooks';
import { captureError } from './error-tracking';

// Logger estructurado: una línea JSON por evento, con nivel e id de la petición, para poder buscar en Portainer
// (o en cualquier recolector de logs) por `requestId`, `level` o `msg`. Los errores además se envían al seguimiento
// de errores (Sentry) si está configurado.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/** Ejecuta `work` con el id de la petición disponible para todos los logs que ocurran dentro. */
export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return requestContext.run({ requestId }, work);
}

export const currentRequestId = () => requestContext.getStore()?.requestId;

/** Un id entrante (de Nginx) solo se acepta si es corto y seguro de escribir en un log; si no, se genera uno nuevo. */
export function sanitizeRequestId(value: string | null | undefined): string | undefined {
  return value && /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : undefined;
}

function threshold(): number {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  return ORDER[(configured as LogLevel) in ORDER ? (configured as LogLevel) : 'info'];
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = { name: error.name, message: error.message, stack: error.stack };
    if (error.cause !== undefined) serialized.cause = serializeError(error.cause);
    return serialized;
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

function write(level: LogLevel, msg: string, context: Record<string, unknown> = {}, error?: unknown) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    requestId: currentRequestId(),
    ...context,
    ...(error === undefined ? {} : { error: serializeError(error) })
  });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  debug: (msg: string, context?: Record<string, unknown>) => write('debug', msg, context),
  info: (msg: string, context?: Record<string, unknown>) => write('info', msg, context),
  warn: (msg: string, context?: Record<string, unknown>) => write('warn', msg, context),
  /** Registra el error y lo envía al seguimiento de errores con el mismo contexto. */
  error: (msg: string, error?: unknown, context?: Record<string, unknown>) => {
    write('error', msg, context, error);
    if (error !== undefined) captureError(error, { requestId: currentRequestId(), message: msg, ...context });
  }
};
