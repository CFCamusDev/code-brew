import { z } from 'zod';
import { adminAction } from '../../../../lib/server/admin/api';
import { createUser, resetUserPassword, updateUser } from '../../../../lib/server/admin/users';

export const prerender = false;

const role = z.enum(['admin', 'operator']);

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    email: z.string().trim().toLowerCase().email('Correo inválido.').max(160),
    name: z.string().trim().min(1, 'Indica el nombre.').max(80),
    role
  }),
  z.object({ action: z.literal('update'), id: z.number().int().positive(), name: z.string().trim().min(1).max(80), role, active: z.boolean() }),
  z.object({ action: z.literal('reset'), id: z.number().int().positive() })
]);

export const POST = adminAction(
  bodySchema,
  async (body, { locals }) => {
    if (body.action === 'create') return { password: await createUser(body) };
    if (body.action === 'reset') return { password: await resetUserPassword(body.id) };
    await updateUser(body.id, locals.admin!.id, body);
  },
  { adminOnly: true }
);
