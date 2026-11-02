import { z } from 'zod';
import { adminAction, idParam } from '../../../../lib/server/admin/api';
import { answerComplaint } from '../../../../lib/server/admin/complaints';

export const prerender = false;

const bodySchema = z.object({
  action: z.literal('respond'),
  response: z.string().trim().min(1, 'Escribe una respuesta.').max(4000)
});

export const POST = adminAction(bodySchema, async (data, context) => {
  await answerComplaint(idParam(context), context.locals.admin!.id, data.response);
});
