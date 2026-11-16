import { z } from 'zod';
import { MAX_LINES, MAX_QUANTITY } from './limits';

// Contratos del carrito y de la cotización (POST /api/cart/quote). Los usan la API y las islas del carrito y del checkout.

export const cartLineSchema = z.object({
  sku: z.string().min(1).max(64),
  grind: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(MAX_QUANTITY)
});
/** Línea del carrito: solo identifica qué quiere el cliente; precios y totales los decide el servidor. */
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartSchema = z.array(cartLineSchema).min(1, 'Tu carrito está vacío.').max(MAX_LINES);

/** Entrada de POST /api/cart/quote. El carrito puede estar vacío: la respuesta trae igual las zonas de envío. */
export const quoteRequestSchema = z.object({
  items: z.array(cartLineSchema).max(MAX_LINES),
  zone: z.string().max(40).optional(),
  region: z.string().max(60).optional()
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

const quoteLineSchema = cartLineSchema.extend({
  productName: z.string(),
  format: z.string(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int()
});

const quoteZoneSchema = z.object({
  slug: z.string(),
  name: z.string(),
  eta: z.string(),
  priceCents: z.number().int(),
  freeFromCents: z.number().int().nullable(),
  freeFromBags: z.number().int().nullable(),
  /** Departamentos que atiende; null = todos. */
  regions: z.array(z.string()).nullable(),
  /** Tiene tarifas distintas según el departamento (se muestra "desde"). */
  hasRegionRates: z.boolean()
});

const issueSchema = z.object({ sku: z.string(), message: z.string() });

/** Respuesta de POST /api/cart/quote: precios, stock y envío vigentes calculados en el servidor. */
export const quoteResponseSchema = z.object({
  lines: z.array(quoteLineSchema),
  issues: z.array(issueSchema),
  zones: z.array(quoteZoneSchema),
  /** Bolsas en el pedido; cuenta para el envío gratis. */
  bags: z.number().int(),
  subtotalCents: z.number().int(),
  shippingCents: z.number().int().nullable(),
  totalCents: z.number().int().nullable()
});
export type Quote = z.infer<typeof quoteResponseSchema>;
export type QuoteIssue = z.infer<typeof issueSchema>;

/** Error 409 de pedidos y del carrito: qué líneas ya no se pueden comprar como están. */
export const cartIssuesErrorSchema = z.object({ error: z.string(), issues: z.array(issueSchema) });
export type CartIssuesErrorResponse = z.infer<typeof cartIssuesErrorSchema>;
