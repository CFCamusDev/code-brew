import type { APIRoute } from 'astro';
import { z } from 'zod';
import { clientIp, createSession, login, SESSION_COOKIE } from '../../../server/modules/identity';

export const prerender = false;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().max(160),
  password: z.string().min(1).max(200)
});

export const POST: APIRoute = async ({ request, cookies, clientAddress, url }) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Ingresa tu correo y contraseña.' }, { status: 400 });

  const result = await login(parsed.data.email, parsed.data.password, clientIp(request, clientAddress));
  if (!result.ok) {
    return result.reason === 'locked'
      ? Response.json({ error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }, { status: 429 })
      : Response.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
  }

  const session = await createSession(result.user.id, request.headers.get('user-agent'));
  cookies.set(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    expires: session.expiresAt
  });
  return Response.json({ ok: true });
};
