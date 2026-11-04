import type { APIRoute } from 'astro';
import { getWhatsAppUrl } from '../../../data/config';
import { whatsAppMessage } from '../../../lib/whatsapp';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const destination = await getWhatsAppUrl(whatsAppMessage(url.searchParams.get('context')));
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
};
