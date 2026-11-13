import { randomUUID } from 'node:crypto';
import type { APIContext, MiddlewareNext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { SENTRY_DSN, SENTRY_ENVIRONMENT } from 'astro:env/server';
import { getSessionUser, SESSION_COOKIE } from './lib/server/auth';
import { initErrorTracking } from './lib/server/error-tracking';
import { logger, runWithRequestId, sanitizeRequestId } from './lib/server/logger';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/login']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protege el panel: /admin (páginas) y /api/admin (acciones). El resto del sitio solo pasa por aquí para el id de petición.
async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
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
}

/**
 * Cada petición lleva un id (el de Nginx en X-Request-Id o uno nuevo) que aparece en todos sus logs y vuelve en la
 * respuesta, para seguir un caso de punta a punta. Un error sin controlar se registra con su contexto y se envía a Sentry.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  initErrorTracking({ dsn: SENTRY_DSN, environment: SENTRY_ENVIRONMENT });
  const requestId = sanitizeRequestId(context.request.headers.get('x-request-id')) ?? randomUUID();
  return runWithRequestId(requestId, async () => {
    try {
      const response = await handleRequest(context, next);
      try {
        response.headers.set('X-Request-Id', requestId);
      } catch {
        // Respuesta con cabeceras inmutables (p. ej. una redirección): se entrega sin el id.
      }
      return response;
    } catch (error) {
      // Solo la ruta: la cadena de consulta puede llevar secretos (p. ej. ?key= del webhook).
      logger.error('error no controlado en la petición', error, { method: context.request.method, path: context.url.pathname });
      throw error;
    }
  });
});
