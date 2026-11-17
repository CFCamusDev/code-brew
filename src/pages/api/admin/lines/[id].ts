import type { APIRoute } from 'astro';
import { lineAdminRequest } from '../../../../server/modules/catalog/http/line-admin';
export const prerender = false;
export const PUT: APIRoute = context => lineAdminRequest(context, 'edit');
export const PATCH: APIRoute = context => lineAdminRequest(context, 'status');
