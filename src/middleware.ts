import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, SESSION_COOKIE } from './lib/server/auth';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/login']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protege el panel: /admin (páginas) y /api/admin (acciones). El resto del sitio no pasa por aquí.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');
  if (context.isPrerendered || (!isAdminPage && !isAdminApi)) return next();

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  context.locals.admin = token ? await getSessionUser(token) : null;

  if (!context.locals.admin && !PUBLIC_ADMIN_PATHS.has(pathname)) {
    if (isAdminApi) return Response.json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, { status: 401 });
    return context.redirect(`/admin/login?next=${encodeURIComponent(pathname + search)}`);
  }

  // Las acciones solo aceptan JSON: junto con la cookie SameSite=Lax evita envíos desde otros sitios (CSRF).
  if (isAdminApi && !SAFE_METHODS.has(context.request.method)) {
    if (!context.request.headers.get('content-type')?.startsWith('application/json')) {
      return Response.json({ error: 'Formato no admitido.' }, { status: 415 });
    }
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
