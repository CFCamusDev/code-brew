import { z } from 'zod';
import { TEMPLATE_NAMES } from '../lines/registry';
import { sanitizeTheme } from '../lines/theme';

export const lineInput = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa letras minúsculas, números y guiones.'),
  description: z.string().trim().max(2000).nullable(),
  template: z.enum(TEMPLATE_NAMES),
  theme: z.record(z.string(), z.string()).refine(theme => Object.keys(theme).length <= 40 && sanitizeTheme(theme).length === Object.keys(theme).length, 'El tema contiene variables CSS no permitidas.'),
  sortOrder: z.number().int().min(0).max(2147483647)
}).strict();
export type LineInput = z.infer<typeof lineInput>;
export const lineAction = z.object({ action: z.enum(['activate', 'archive']) }).strict();
