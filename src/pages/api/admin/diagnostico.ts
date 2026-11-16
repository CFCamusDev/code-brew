import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adminAction } from '../../../lib/server/admin/api';

export const prerender = false;

/**
 * Lanza un error a propósito para comprobar de punta a punta el seguimiento de errores: debe quedar en los logs con
 * su `requestId` y aparecer en el panel de Sentry con su contexto. Solo administradores.
 *   curl -X POST -H 'content-type: application/json' -b cb_admin=<sesión> -d '{}' https://<dominio>/api/admin/diagnostico
 */
export const POST: APIRoute = adminAction(
  z.object({}),
  async () => {
    throw new Error('Error de prueba lanzado desde /api/admin/diagnostico');
  },
  { adminOnly: true }
);
