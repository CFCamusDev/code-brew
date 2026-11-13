import type { Clock } from '../../../shared/clock';
import type { SettingStore } from './ports/setting-store';

export const SETTINGS_CACHE_TTL_MS = 60_000;

/**
 * Lector de la configuración del sitio editable desde /admin/configuracion (redes sociales, WhatsApp, políticas).
 * Cachea un minuto en memoria: el valor cambia poco y así no se golpea la base en cada render. Si la base no
 * responde, usa el último valor cacheado o el valor por defecto: nunca se cae la página por esto.
 */
export function createSettingReader(deps: { store: SettingStore; clock: Clock; ttlMs?: number; logError?: (message: string, error: unknown) => void }) {
  const ttlMs = deps.ttlMs ?? SETTINGS_CACHE_TTL_MS;
  const logError = deps.logError ?? ((message, error) => console.error(message, error));
  const cache = new Map<string, { value: unknown; at: number }>();

  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      const cached = cache.get(key);
      const now = deps.clock.now().getTime();
      if (cached && now - cached.at < ttlMs) return cached.value as T;
      try {
        const row = await deps.store.find(key);
        const value = row ? (row.value as T) : fallback;
        cache.set(key, { value, at: now });
        return value;
      } catch (error) {
        logError(`[settings] no se pudo leer "${key}"`, error);
        return (cached?.value as T) ?? fallback;
      }
    },
    /** Se llama tras guardar desde el admin para que el cambio se vea sin esperar el TTL del caché. */
    invalidate(key: string) {
      cache.delete(key);
    }
  };
}
