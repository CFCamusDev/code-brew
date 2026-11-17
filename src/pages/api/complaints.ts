import type { APIRoute } from 'astro';
import { z } from 'zod';
import { complaintSchema } from '../../contracts/complaints';
import { createComplaint } from '../../server/modules/complaints';
import { formatComplaintNumber } from '../../lib/shop/format';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = complaintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Revisa los datos del formulario.', fields: z.flattenError(parsed.error) }, { status: 400 });
  }

  const complaint = await createComplaint(parsed.data);
  return Response.json({ number: formatComplaintNumber(complaint) }, { status: 201 });
};
