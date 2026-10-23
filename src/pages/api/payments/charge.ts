import type { APIRoute } from 'astro';
import { z } from 'zod';
import { payWithToken } from '../../../lib/server/payments';
import { isOrderId } from '../../../lib/server/shop';

export const prerender = false;

const bodySchema = z.object({
  orderId: z.string().refine(isOrderId),
  tokenId: z.string().min(1).max(100),
  email: z.string().trim().email().max(160),
  deviceId: z.string().max(100).optional(),
  // Parámetros que devuelve Culqi3DS tras autenticar (eci, xid, cavv, protocolVersion, directoryServerTransactionId).
  authentication3DS: z.record(z.string(), z.string().max(500)).optional()
});

export const POST: APIRoute = async ({ request }) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ status: 'error', message: 'Solicitud de pago inválida.' }, { status: 400 });

  const { orderId, ...input } = parsed.data;
  const result = await payWithToken(orderId, input);
  const httpStatus = {
    paid: 200,
    '3ds_required': 200,
    not_found: 404,
    disabled: 503,
    declined: 402,
    invalid: 409,
    unavailable: 409,
    error: 502
  }[result.status];
  return Response.json(result, { status: httpStatus, headers: { 'Cache-Control': 'no-store' } });
};
