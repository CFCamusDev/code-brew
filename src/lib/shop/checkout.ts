import { z } from 'zod';
import { MAX_LINES, MAX_QUANTITY } from './limits';

// Esquemas compartidos: el formulario los usa para validar en el navegador y la API los vuelve a aplicar en el servidor.

export { MAX_LINES, MAX_QUANTITY };

export const cartLineSchema = z.object({
  sku: z.string().min(1).max(64),
  grind: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(MAX_QUANTITY)
});
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartSchema = z.array(cartLineSchema).min(1, 'Tu carrito está vacío.').max(MAX_LINES);

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const required = (max: number, message: string) => text(max).min(1, message);
const optional = (max: number) =>
  text(max)
    .optional()
    .transform(value => value || undefined);

export const customerSchema = z.object({
  name: required(120, 'Ingresa tu nombre completo.'),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido.').max(160),
  phone: z
    .string()
    .transform(value => value.replace(/[\s-]/g, '').replace(/^\+?51/, ''))
    .pipe(z.string().regex(/^9\d{8}$/, 'Ingresa un celular peruano de 9 dígitos.')),
  document: optional(15).refine(value => !value || /^\d{8}$|^[A-Za-z0-9]{9,12}$/.test(value), 'DNI de 8 dígitos o CE válido.'),
  zone: required(40, 'Elige una zona de envío.'),
  region: required(60, 'Indica el departamento.'),
  city: required(80, 'Indica la provincia o ciudad.'),
  district: required(80, 'Indica el distrito.'),
  address: required(200, 'Indica la dirección de entrega.'),
  reference: optional(200),
  notes: optional(500)
});
export type CustomerForm = z.input<typeof customerSchema>;
export type Customer = z.output<typeof customerSchema>;

export const createOrderSchema = z.object({
  items: cartSchema,
  customer: customerSchema,
  acceptedPolicies: z.literal(true, { message: 'Debes aceptar los Términos y la Política de privacidad para continuar.' })
});

export const quoteSchema = z.object({
  items: z.array(cartLineSchema).max(MAX_LINES),
  zone: z.string().max(40).optional(),
  region: z.string().max(60).optional()
});

export const REGIONS = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco',
  'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno',
  'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
] as const;

/** Respuesta de /api/cart/quote: precios y stock vigentes calculados en el servidor. */
export interface Quote {
  lines: {
    sku: string;
    grind: string;
    quantity: number;
    productName: string;
    format: string;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
  issues: { sku: string; message: string }[];
  zones: {
    slug: string;
    name: string;
    eta: string;
    priceCents: number;
    freeFromCents: number | null;
    freeFromBags: number | null;
    /** Departamentos que atiende; null = todos. */
    regions: string[] | null;
    /** Tiene tarifas distintas según el departamento (se muestra "desde"). */
    hasRegionRates: boolean;
  }[];
  /** Bolsas en el pedido (el Pack Developer cuenta 2). */
  bags: number;
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number | null;
}
