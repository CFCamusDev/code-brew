import type { APIRoute } from 'astro';
import { lineAdminRequest } from '../../../../server/modules/catalog/http/line-admin';
export const prerender = false;
export const GET: APIRoute = context => lineAdminRequest(context, 'list');
export const POST: APIRoute = context => lineAdminRequest(context, 'create');
