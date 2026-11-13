import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isValidWebhookKey } from '../../src/server/modules/payments/http/webhook-key';
import { validateEnvironment } from '../../scripts/lib/validate-env.mjs';

const current = 'a'.repeat(40);
const previous = 'b'.repeat(40);

describe('clave del webhook de Culqi', () => {
  it('acepta la clave vigente', () => {
    expect(isValidWebhookKey(current, [current])).toBe(true);
  });

  it('durante una rotación acepta la nueva y la anterior, y nada más', () => {
    expect(isValidWebhookKey(current, [current, previous])).toBe(true);
    expect(isValidWebhookKey(previous, [current, previous])).toBe(true);
    expect(isValidWebhookKey('c'.repeat(40), [current, previous])).toBe(false);
  });

  it('después de retirar la anterior deja de valer', () => {
    expect(isValidWebhookKey(previous, [current, undefined])).toBe(false);
    expect(isValidWebhookKey(previous, [current, ''])).toBe(false);
  });

  it('sin clave recibida o sin claves configuradas rechaza', () => {
    expect(isValidWebhookKey(null, [current])).toBe(false);
    expect(isValidWebhookKey('', [current])).toBe(false);
    expect(isValidWebhookKey(current, [])).toBe(false);
    expect(isValidWebhookKey(current, [undefined, ''])).toBe(false);
  });

  it('claves de distinto largo no rompen la comparación', () => {
    expect(isValidWebhookKey('corta', [current])).toBe(false);
    expect(isValidWebhookKey(current + 'x', [current])).toBe(false);
  });
});

describe('entorno durante la rotación', () => {
  const base = {
    DATABASE_URL: 'postgres://codebrew:una-contrasena-segura-123@db/codebrew',
    CULQI_PUBLIC_KEY: 'pk_test_abc123',
    CULQI_SECRET_KEY: 'sk_test_abc123',
    CULQI_WEBHOOK_SECRET: current,
    SITE_URL: 'http://127.0.0.1:4321'
  };

  it('acepta una clave anterior distinta y larga', () => {
    expect(validateEnvironment({ ...base, CULQI_WEBHOOK_SECRET_PREVIOUS: previous })).toEqual([]);
  });

  it('rechaza una clave anterior corta o igual a la vigente', () => {
    expect(validateEnvironment({ ...base, CULQI_WEBHOOK_SECRET_PREVIOUS: 'corta' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...base, CULQI_WEBHOOK_SECRET_PREVIOUS: current }).length).toBeGreaterThan(0);
  });
});

describe('logs de Nginx para el webhook', () => {
  const conf = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');

  it('registra el webhook sin la cadena de consulta y sin registro de errores', () => {
    expect(conf).toMatch(/log_format webhook [^;]*"\$request_method \$uri \$server_protocol"/);
    const location = /location = \/api\/webhooks\/culqi \{([^}]*)\}/.exec(conf)?.[1] ?? '';
    expect(location).toContain('access_log /var/log/nginx/access.log webhook;');
    expect(location).toContain('error_log /dev/null;');
  });
});
