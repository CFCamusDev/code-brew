import type { APIRoute } from 'astro';
import { CATALOG_CACHE_CONTROL, type PublicLine } from '../../../../contracts/catalog';
import { findPublicLine } from '../../../../server/modules/catalog';

export const prerender = false;

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Línea publicada con su tema, plantilla y productos visibles en orden de lanzamiento. */
export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const line = SLUG.test(slug) ? await findPublicLine(slug) : null;
  if (!line) return Response.json({ error: 'Línea no encontrada.' }, { status: 404, headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  return Response.json(line satisfies PublicLine, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
};
