import type { APIRoute } from 'astro';
import { deleteSession, SESSION_COOKIE } from '../../../server/modules/identity';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return Response.json({ ok: true });
};
