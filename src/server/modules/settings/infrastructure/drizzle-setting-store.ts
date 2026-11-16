import { eq } from 'drizzle-orm';
import { getDb } from '../../../../lib/server/db';
import { siteSettings } from '../../../../lib/server/db/schema';
import type { SettingStore } from '../application/ports/setting-store';

/** Abre la conexión en cada lectura (la base se conecta al primer uso, no al importar). */
export const drizzleSettingStore: SettingStore = {
  async find(key) {
    const [row] = await getDb().select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key));
    return row ?? null;
  }
};
