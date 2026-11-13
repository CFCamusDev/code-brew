import { z } from 'zod';
import { adminAction } from '../../../lib/server/admin/api';
import { updateSetting } from '../../../lib/server/admin/settings';
import { POLICY_KEYS, SOCIAL_LINKS_KEY } from '../../../server/modules/settings';

export const prerender = false;

const url = z.string().trim().max(300).refine(value => value === '' || /^https?:\/\//.test(value), 'Debe ser un link https:// o quedar vacío.');
const phone = z
  .string()
  .trim()
  .transform(value => value.replace(/[\s-]/g, '').replace(/^\+?51/, ''))
  .refine(value => value === '' || /^9\d{8}$/.test(value), 'Celular peruano de 9 dígitos, o déjalo vacío.');

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('social-links'),
    instagram: url,
    tiktok: url,
    facebook: url,
    whatsapp: phone
  }),
  z.object({
    action: z.literal('policy'),
    slug: z.enum(Object.keys(POLICY_KEYS) as [string, ...string[]]),
    title: z.string().trim().min(1, 'Ponle un título.').max(120),
    body: z.string().trim().max(20_000)
  })
]);

// Solo un administrador (no operador) toca la configuración del negocio: redes, WhatsApp y políticas.
export const POST = adminAction(
  bodySchema,
  async (data, { locals }) => {
    const adminId = locals.admin!.id;
    if (data.action === 'social-links') {
      const { action, ...links } = data;
      await updateSetting(SOCIAL_LINKS_KEY, links, adminId);
    } else {
      const key = POLICY_KEYS[data.slug as keyof typeof POLICY_KEYS];
      await updateSetting(key, { title: data.title, body: data.body }, adminId);
    }
  },
  { adminOnly: true }
);
