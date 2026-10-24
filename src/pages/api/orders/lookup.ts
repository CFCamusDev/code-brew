import type { APIRoute } from 'astro';
import { z } from 'zod';
import { clientIp } from '../../../lib/server/auth';
import { createRateLimiter } from '../../../lib/server/rate-limit';
import { findOrderIdByNumberAndEmail } from '../../../lib/server/shop';
import { parseOrderNumber } from '../../../lib/shop/format';

export const prerender = false;

const bodySchema = z.object({
  number: z.string().trim().min(1).max(20),
  email: z.string().trim().toLowerCase().max(160)
});

// Evita que alguien pruebe números de pedido al voleo para dar con uno ajeno.
const limiter = createRateLimiter(15 * 60 * 1000, 8);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Ingresa tu número de pedido y tu correo.' }, { status: 400 });

  const ip = clientIp(request, clientAddress);
  if (limiter.isLocked(`ip:${ip}`)) {
    return Response.json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, { status: 429 });
  }

  const number = parseOrderNumber(parsed.data.number);
  const id = number ? await findOrderIdByNumberAndEmail(number, parsed.data.email) : undefined;
  if (!id) {
    limiter.recordAttempt(`ip:${ip}`);
    return Response.json({ error: 'No encontramos un pedido con esos datos. Revisa el número y el correo.' }, { status: 404 });
  }

  limiter.reset(`ip:${ip}`);
  return Response.json({ id });
};
