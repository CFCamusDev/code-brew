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

  it('exige HTTPS público y permite HTTP local para pruebas', () => {
    expect(validateEnvironment({ ...payments, SITE_URL: 'http://127.0.0.1:4321' })).toEqual([]);
    for (const siteUrl of ['', 'http://coffeecodebrew.com', 'https://coffeecodebrew.com/admin', 'https://user:password@coffeecodebrew.com']) {
      expect(validateEnvironment({ ...payments, SITE_URL: siteUrl }).length).toBeGreaterThan(0);
    }
  });

  describe('Culqi según APP_ENV', () => {
    const live = { ...payments, CULQI_PUBLIC_KEY: 'pk_live_example123', CULQI_SECRET_KEY: 'sk_live_example123' };

    it('sin APP_ENV mantiene Culqi opcional (CI, test:docker y despliegues actuales)', () => {
      expect(validateEnvironment(base)).toEqual([]);
      expect(validateEnvironment({ ...base, NODE_ENV: 'production' })).toEqual([]);
    });

    it('rechaza un APP_ENV desconocido', () => {
      expect(validateEnvironment({ ...base, APP_ENV: 'prod' })).toEqual(['APP_ENV debe ser local, staging o production.']);
    });

    it.each(['staging', 'production'])('en %s exige las tres variables y dice cuáles faltan', appEnv => {
      expect(validateEnvironment({ ...base, APP_ENV: appEnv })).toEqual([
        `En APP_ENV=${appEnv} faltan CULQI_PUBLIC_KEY, CULQI_SECRET_KEY, CULQI_WEBHOOK_SECRET.`
      ]);
      const errors = validateEnvironment({ ...(appEnv === 'production' ? live : payments), APP_ENV: appEnv, CULQI_WEBHOOK_SECRET: '' });
      expect(errors.some(error => error.includes('faltan CULQI_WEBHOOK_SECRET'))).toBe(true);
    });

    it('en producción solo acepta llaves live', () => {
      expect(validateEnvironment({ ...live, APP_ENV: 'production' })).toEqual([]);
      expect(validateEnvironment({ ...payments, APP_ENV: 'production' })).toEqual([
        'En APP_ENV=production las llaves Culqi deben ser de producción (pk_live_/sk_live_), no de prueba.'
      ]);
    });

    it('en staging y local acepta llaves de prueba; staging rechaza llaves live', () => {
      expect(validateEnvironment({ ...payments, APP_ENV: 'staging' })).toEqual([]);
      expect(validateEnvironment({ ...payments, APP_ENV: 'local' })).toEqual([]);
      expect(validateEnvironment({ ...live, APP_ENV: 'staging' }).length).toBe(1);
    });

    it('rechaza llaves mezcladas en cualquier entorno', () => {
      for (const APP_ENV of [undefined, 'local', 'staging', 'production']) {
        expect(validateEnvironment({ ...payments, APP_ENV, CULQI_SECRET_KEY: 'sk_live_example123' }).length, String(APP_ENV)).toBeGreaterThan(0);
      }
    });

    it('nunca muestra las llaves ni el secreto en los mensajes', () => {
      const secrets = { ...payments, APP_ENV: 'production', CULQI_SECRET_KEY: 'sk_live_supersecreto999', CULQI_WEBHOOK_SECRET: 'w'.repeat(40) };
      const text = validateEnvironment(secrets).join(' ');
      expect(text).not.toContain('example123');
      expect(text).not.toContain('supersecreto999');
      expect(text).not.toContain('w'.repeat(40));
    });
  });

  it('exige remitente y URL pública al habilitar correo', () => {
    expect(validateEnvironment({ ...base, RESEND_API_KEY: 'test-only' })).toHaveLength(2);
    expect(validateEnvironment({ ...base, RESEND_API_KEY: 'test-only', EMAIL_FROM: 'test@example.com', SITE_URL: 'https://coffeecodebrew.com' })).toEqual([]);
  });
});
