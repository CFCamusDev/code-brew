import type { APIRoute } from 'astro';
import { subscribeRequest } from '../../server/modules/waitlist/http/subscribe';
export const prerender = false;
export const POST: APIRoute = subscribeRequest;
export const ALL: APIRoute = () => Response.json({ error: 'Método no permitido.' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
