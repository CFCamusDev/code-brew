import type { APIRoute } from 'astro';
import { CATALOG_CACHE_CONTROL, type PublicProduct } from '../../../../contracts/catalog';
import { findPublicProduct } from '../../../../server/modules/catalog';

export const prerender = false;

const SLUG = /^[a-z0-9-]{1,80}$/;

/** Producto publicado: ficha, campos revelados y, si está a la venta, presentaciones, precios e imágenes. */
export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  const product = SLUG.test(slug) ? await findPublicProduct(slug) : null;
  if (!product) return Response.json({ error: 'Producto no encontrado.' }, { status: 404, headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  return Response.json(product satisfies PublicProduct, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
};
