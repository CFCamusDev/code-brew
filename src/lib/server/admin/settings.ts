import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { siteSettings } from '../db/schema';
import { invalidateSetting, POLICY_KEYS, SOCIAL_LINKS_KEY, type PolicyContent, type SocialLinks } from '../settings';

const DEFAULT_SOCIAL_LINKS: SocialLinks = { instagram: '', tiktok: '', facebook: '', whatsapp: '' };
const DEFAULT_POLICY: PolicyContent = { title: '', body: '' };

export async function getSettingsForAdmin() {
  const rows = await getDb().select().from(siteSettings);
  const byKey = new Map(rows.map(row => [row.key, row]));

  const socialLinks = (byKey.get(SOCIAL_LINKS_KEY)?.value as SocialLinks) ?? DEFAULT_SOCIAL_LINKS;
  const policies = Object.fromEntries(
    Object.entries(POLICY_KEYS).map(([slug, key]) => [
      slug,
      { ...((byKey.get(key)?.value as PolicyContent) ?? DEFAULT_POLICY), updatedAt: byKey.get(key)?.updatedAt ?? null }
    ])
  );

  return { socialLinks, policies };
}
export type AdminSettings = Awaited<ReturnType<typeof getSettingsForAdmin>>;

/** `key` ya viene validado contra las claves conocidas en el endpoint (ver adminAction). */
export async function updateSetting(key: string, value: unknown, adminUserId: number) {
  await getDb()
    .insert(siteSettings)
    .values({ key, value, updatedBy: adminUserId })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: adminUserId, updatedAt: new Date() } });
  invalidateSetting(key);
}
