import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../scripts/lib/validate-env.mjs';

const base = { DATABASE_URL: 'postgres://codebrew:qa-password@db:5432/codebrew' };
const payments = {
  ...base,
  CULQI_PUBLIC_KEY: 'pk_test_example123',
  CULQI_SECRET_KEY: 'sk_test_example123',
  CULQI_WEBHOOK_SECRET: 'a'.repeat(64),
  SITE_URL: 'https://coffeecodebrew.com'
};

describe('configuración del despliegue', () => {
  it('permite operar sin pagos ni correo', () => {
    expect(validateEnvironment(base)).toEqual([]);
  });

  it.each(['', 'not-a-url', 'https://db/codebrew', 'postgres://db/'])('rechaza DATABASE_URL inválida: %s', databaseUrl => {
    expect(validateEnvironment({ DATABASE_URL: databaseUrl }).length).toBeGreaterThan(0);
  });

  it('rechaza la contraseña de ejemplo sin exponerla en el error', () => {
    const errors = validateEnvironment({ DATABASE_URL: 'postgres://codebrew:cambia-esta-contrasena@db/codebrew' });
    expect(errors).toHaveLength(1);
    expect(errors.join()).not.toContain('postgres://');
  });

  it('exige ambas llaves del mismo entorno y un secreto de webhook', () => {
    expect(validateEnvironment(payments)).toEqual([]);
    expect(validateEnvironment({ ...payments, CULQI_SECRET_KEY: '' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...payments, CULQI_SECRET_KEY: 'sk_live_example123' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...payments, CULQI_WEBHOOK_SECRET: '' }).length).toBeGreaterThan(0);
  });

  it('rechaza secretos cortos y llaves de ejemplo', () => {
    expect(validateEnvironment({ ...payments, CRON_SECRET: 'short' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...payments, CULQI_WEBHOOK_SECRET: 'short' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...payments, CULQI_SECRET_KEY: 'sk_test_xxxxxxxxxxxxxxxx' }).length).toBeGreaterThan(0);
  });

  it('valida el DSN de Sentry: opcional, pero si se indica debe ser una URL HTTPS', () => {
    expect(validateEnvironment({ ...payments, SENTRY_DSN: '' })).toEqual([]);
    expect(validateEnvironment({ ...payments, SENTRY_DSN: 'https://publica@o123.ingest.sentry.io/456' })).toEqual([]);
    expect(validateEnvironment({ ...payments, SENTRY_DSN: 'no-es-una-url' }).length).toBeGreaterThan(0);
    expect(validateEnvironment({ ...payments, SENTRY_DSN: 'http://publica@o123.ingest.sentry.io/456' }).length).toBeGreaterThan(0);
  });

  it('exige HTTPS público y permite HTTP local para pruebas', () => {
    expect(validateEnvironment({ ...payments, SITE_URL: 'http://127.0.0.1:4321' })).toEqual([]);
    for (const siteUrl of ['', 'http://coffeecodebrew.com', 'https://coffeecodebrew.com/admin', 'https://user:password@coffeecodebrew.com']) {
      expect(validateEnvironment({ ...payments, SITE_URL: siteUrl }).length).toBeGreaterThan(0);
    }
  });

  it('exige remitente y URL pública al habilitar correo', () => {
    expect(validateEnvironment({ ...base, RESEND_API_KEY: 'test-only' })).toHaveLength(2);
    expect(validateEnvironment({ ...base, RESEND_API_KEY: 'test-only', EMAIL_FROM: 'test@example.com', SITE_URL: 'https://coffeecodebrew.com' })).toEqual([]);
  });
});
