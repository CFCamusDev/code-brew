import { describe, expect, it } from 'vitest';
import { createSettingReader, SETTINGS_CACHE_TTL_MS } from '../../src/server/modules/settings/application/setting-reader';
import type { SettingStore } from '../../src/server/modules/settings/application/ports/setting-store';
import { FixedClock } from '../../src/server/shared/clock';

function harness(values: Record<string, unknown> = {}) {
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const state = { reads: 0, failing: false, values };
  const logs: string[] = [];
  const store: SettingStore = {
    async find(key) {
      state.reads++;
      if (state.failing) throw new Error('base caída');
      return key in state.values ? { value: state.values[key] } : null;
    }
  };
  const reader = createSettingReader({ store, clock, logError: message => void logs.push(message) });
  return { reader, clock, state, logs };
}

describe('lector de configuración', () => {
  it('devuelve el valor guardado o el valor por defecto si no existe', async () => {
    const { reader } = harness({ social_links: { instagram: 'x' } });
    expect(await reader.get('social_links', {})).toEqual({ instagram: 'x' });
    expect(await reader.get('policy_terms', { title: '' })).toEqual({ title: '' });
  });

  it('cachea un minuto y vuelve a leer al vencer', async () => {
    const { reader, clock, state } = harness({ k: 1 });
    await reader.get('k', 0);
    await reader.get('k', 0);
    expect(state.reads).toBe(1);
    clock.advance(SETTINGS_CACHE_TTL_MS + 1);
    state.values.k = 2;
    expect(await reader.get('k', 0)).toBe(2);
    expect(state.reads).toBe(2);
  });

  it('invalidate hace que el siguiente cambio se vea sin esperar el TTL', async () => {
    const { reader, state } = harness({ k: 1 });
    await reader.get('k', 0);
    state.values.k = 2;
    reader.invalidate('k');
    expect(await reader.get('k', 0)).toBe(2);
  });

  it('si la base falla usa el último valor cacheado, o el defecto, y lo registra', async () => {
    const { reader, clock, state, logs } = harness({ k: 1 });
    await reader.get('k', 0);
    state.failing = true;
    clock.advance(SETTINGS_CACHE_TTL_MS + 1);
    expect(await reader.get('k', 0)).toBe(1);
    expect(await reader.get('otra', 'por defecto')).toBe('por defecto');
    expect(logs).toEqual(['[settings] no se pudo leer "k"', '[settings] no se pudo leer "otra"']);
  });
});
