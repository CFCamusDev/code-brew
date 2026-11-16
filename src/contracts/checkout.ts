import { z } from 'zod';
import { cartSchema } from './cart';

// Contratos del checkout y de la creación del pedido (POST /api/orders). El formulario los usa para validar en el
// navegador y la API los vuelve a aplicar en el servidor.

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
/** Lo que escribe el cliente en el formulario. */
export type CustomerForm = z.input<typeof customerSchema>;
/** Datos del cliente ya normalizados (celular sin prefijo, correo en minúsculas…). */
export type Customer = z.output<typeof customerSchema>;

/** Entrada de POST /api/orders. */
export const createOrderSchema = z.object({
  items: cartSchema,
  customer: customerSchema,
  acceptedPolicies: z.literal(true, { message: 'Debes aceptar los Términos y la Política de privacidad para continuar.' })
});
export type CreateOrderRequest = z.input<typeof createOrderSchema>;

/** Respuesta 201 de POST /api/orders: el id funciona como enlace privado del pedido. */
export const createOrderResponseSchema = z.object({ id: z.string().uuid(), number: z.number().int() });
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

export const REGIONS = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco', 'Huancavelica', 'Huánuco',
  'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno',
  'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
] as const;
