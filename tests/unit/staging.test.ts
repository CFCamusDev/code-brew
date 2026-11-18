import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertStagingStack, deployStaging, deploymentSettings, isReady } from '../../scripts/deploy-staging.mjs';

const env = { STAGING_PORTAINER_URL: 'https://portainer.example.test', STAGING_SITE_URL: 'https://staging.coffeecodebrew.com', STAGING_STACK_ID: '3', STAGING_ENDPOINT_ID: '2', STAGING_PORTAINER_API_KEY: 'private-test-token', EXPECTED_SHA: 'a'.repeat(40), STAGING_DEPLOYMENT_ID: 'test-deploy-123' };
const settings = deploymentSettings(env);
const stack = () => ({ Name: 'codebrew-staging', EndpointId: 2, AdditionalFiles: ['docker-compose.staging.yml'], GitConfig: { URL: 'https://github.com/CFCamusDev/code-brew.git', ReferenceName: 'refs/heads/develop', ConfigHash: env.EXPECTED_SHA }, Env: [{ name: 'POSTGRES_PASSWORD', value: 'private-db-password' }, { name: 'STAGING_DEPLOYMENT_ID', value: 'old' }] });
const healthy = { status: 'ok', database: 'ok', migrations: 'ok', environment: 'staging', deploymentId: settings.deploymentId };
describe('despliegue de staging', () => {
  it.each([{ STAGING_SITE_URL: 'https://coffeecodebrew.com' }, { STAGING_PORTAINER_URL: 'http://portainer.example.test' }, { STAGING_STACK_ID: '../production' }, { STAGING_PORTAINER_API_KEY: '' }, { EXPECTED_SHA: 'develop' }, { STAGING_DEPLOYMENT_ID: 'manual' }])('rechaza configuración incorrecta antes de conectar: %j', change => {
    expect(() => deploymentSettings({ ...env, ...change })).toThrow();
  });
  it.each([{ Name: 'codebrew-production' }, { EndpointId: 4 }, { AdditionalFiles: [] }, { GitConfig: { URL: 'https://github.com/CFCamusDev/code-brew.git', ReferenceName: 'refs/heads/main' } }])('no permite modificar otra stack: %j', change => {
    expect(() => assertStagingStack({ ...stack(), ...change }, settings)).toThrow();
  });
  it('no acepta la salud anterior, producción ni migraciones pendientes', () => {
    expect(isReady(healthy, settings)).toBe(true);
    expect(isReady({ ...healthy, deploymentId: 'old' }, settings)).toBe(false);
    expect(isReady({ ...healthy, environment: 'production' }, settings)).toBe(false);
    expect(isReady({ ...healthy, migrations: 'pending' }, settings)).toBe(false);
  });
  it('conserva las variables y espera una instancia nueva y la revisión comprobada', async () => {
    let probes = 0;
    let payload: any;
    const log = vi.fn();
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      const url = String(input);
      if (init?.method === 'PUT') { payload = JSON.parse(String(init.body)); return Response.json({}); }
      if (url.endsWith('/api/health')) return Response.json({ ...healthy, deploymentId: ++probes === 1 ? 'old' : settings.deploymentId });
      return Response.json(stack());
    });
    await deployStaging(env, { fetchImpl, sleep: async () => {}, attempts: 2, log });
    expect(probes).toBe(2);
    expect(payload.Env).toEqual([{ name: 'POSTGRES_PASSWORD', value: 'private-db-password' }, { name: 'STAGING_DEPLOYMENT_ID', value: settings.deploymentId }]);
    expect(payload.Prune).toBe(false);
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
  it('no informa éxito si Portainer tomó un commit distinto', async () => {
    let reads = 0;
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      if (init?.method === 'PUT') return Response.json({});
      if (String(input).endsWith('/api/health')) return Response.json(healthy);
      const value = stack(); if (++reads > 1) value.GitConfig.ConfigHash = 'b'.repeat(40);
      return Response.json(value);
    });
    await expect(deployStaging(env, { fetchImpl, attempts: 1, log: () => {} })).rejects.toThrow('revisión diferente');
  });
  it('agota el plazo sin declarar listo un despliegue antiguo', async () => {
    const fetchImpl: typeof fetch = vi.fn(async input => Response.json(String(input).endsWith('/api/health') ? { ...healthy, deploymentId: 'old' } : stack()));
    await expect(deployStaging(env, { fetchImpl, sleep: async () => {}, attempts: 2, log: () => {} })).rejects.toThrow('dentro del plazo');
  });
  it('el pipeline solo llama al despliegue después de todo el CI y con habilitación explícita', () => {
    const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toContain('needs: [calidad, integracion, docker]');
    expect(ci).toContain("github.event_name == 'push' && github.ref == 'refs/heads/develop' && vars.STAGING_ENABLED == 'true'");
    const workflow = readFileSync(new URL('../../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('name: staging');
    expect(workflow).not.toContain('secrets.PORTAINER_WEBHOOK_URL');
  });
});
