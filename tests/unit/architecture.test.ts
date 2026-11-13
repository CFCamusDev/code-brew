import { createRequire } from 'node:module';
import { cruise } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

// Verifica que las reglas de .dependency-cruiser.cjs realmente detectan los cruces prohibidos (ADR 0002).
const config = createRequire(import.meta.url)('../../.dependency-cruiser.cjs');

async function violations() {
  const result = await cruise(['tests/fixtures/architecture'], { validate: true, ruleSet: config, ...config.options, tsConfig: undefined });
  if (typeof result.output === 'string') throw new Error('Se esperaba salida estructurada');
  return result.output.summary.violations.map(v => `${v.rule.name}: ${v.from.split('modules/')[1]} -> ${v.to.includes('drizzle-orm') ? 'drizzle-orm' : (v.to.split('modules/')[1] ?? v.to)}`);
}

describe('reglas de arquitectura (dependency-cruiser)', () => {
  it('el dominio no importa infraestructura ni Drizzle', async () => {
    const found = await violations();
    expect(found).toContain('dominio-puro: demo/domain/bad.ts -> demo/infrastructure/repo.ts');
    expect(found).toContain('dominio-puro: demo/domain/bad.ts -> drizzle-orm');
  });

  it('la aplicación no importa infraestructura', async () => {
    expect(await violations()).toContain('aplicacion-sin-infraestructura: demo/application/bad.ts -> demo/infrastructure/repo.ts');
  });

  it('http no importa infraestructura salvo composition.ts', async () => {
    const found = await violations();
    expect(found).toContain('http-sin-infraestructura: demo/http/controller.ts -> demo/infrastructure/repo.ts');
    expect(found.some(v => v.includes('composition.ts'))).toBe(false);
  });

  it('un módulo solo usa a otro por su index.ts', async () => {
    expect(await violations()).toContain('modulos-solo-por-su-indice: demo/application/cross.ts -> other/domain/secret.ts');
  });

  it('los archivos correctos no generan violaciones', async () => {
    const found = await violations();
    expect(found.some(v => v.includes('application/ok.ts'))).toBe(false);
    expect(found).toHaveLength(5);
  });
});
