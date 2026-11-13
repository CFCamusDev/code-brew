import type { APIRoute } from 'astro';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../../../../../scripts/lib/password.mjs';
import { changePassword, createSession, deleteUserSessions, SESSION_COOKIE } from '../../../../server/modules/identity';

export const prerender = false;

const bodySchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PASSWORD_LENGTH, `La nueva contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`).max(200)
});

export const POST: APIRoute = async ({ request, locals, cookies, url }) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });

  const admin = locals.admin!;
  if (!(await changePassword(admin.id, parsed.data.current, parsed.data.next))) {
    return Response.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 });
  }
  // Cierra las demás sesiones y deja abierta solo esta.
  await deleteUserSessions(admin.id);
  const session = await createSession(admin.id, request.headers.get('user-agent'));
  cookies.set(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    expires: session.expiresAt
  });
  return Response.json({ ok: true });
};
