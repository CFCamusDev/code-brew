import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { siteSettings } from './db/schema';

// Config del sitio editable desde /admin/configuracion (redes sociales, WhatsApp, políticas).
// Se cachea un minuto en memoria: el valor cambia poco y así no se golpea la base en cada
// render. Si la base no responde, se usa el último valor cacheado o el valor por defecto,
// igual que getLiveCatalog en shop.ts: nunca se cae la página por esto.

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as T;
  try {
    const [row] = await getDb().select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key));
    const value = row ? (row.value as T) : fallback;
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch (error) {
    console.error(`[settings] no se pudo leer "${key}"`, error);
    return (cached?.value as T) ?? fallback;
  }
}

/** Se llama tras guardar desde el admin para que el cambio se vea sin esperar el TTL del caché. */
export function invalidateSetting(key: string) {
  cache.delete(key);
}

export interface SocialLinks {
  instagram: string;
  tiktok: string;
  facebook: string;
  whatsapp: string;
}

export interface PolicyContent {
  title: string;
  body: string;
}

export const SOCIAL_LINKS_KEY = 'social_links';
export const POLICY_KEYS = {
  terminos: 'policy_terms',
  privacidad: 'policy_privacy',
  'envios-devoluciones': 'policy_shipping_returns'
} as const;
export type PolicySlug = keyof typeof POLICY_KEYS;
