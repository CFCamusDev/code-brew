import { z } from 'zod';

// Esquema del Libro de Reclamaciones virtual: lo usa el formulario público y el endpoint que lo recibe.

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);
const required = (max: number, message: string) => text(max).min(1, message);
const optional = (max: number) =>
  text(max)
    .optional()
    .transform(value => value || undefined);

const peruPhone = z
  .string()
  .trim()
  .transform(value => value.replace(/[\s-]/g, '').replace(/^\+?51/, ''))
  .refine(value => value === '' || /^9\d{8}$/.test(value), 'Ingresa un celular peruano de 9 dígitos.')
  .transform(value => value || undefined);

const peruDocument = (message: string) =>
  text(15)
    .optional()
    .refine(value => !value || /^\d{8}$|^[A-Za-z0-9]{9,12}$/.test(value), message)
    .transform(value => value || undefined);

export const complaintSchema = z
  .object({
    type: z.enum(['reclamo', 'queja'], { message: 'Indica si es un reclamo o una queja.' }),
    consumerName: required(120, 'Ingresa tu nombre completo.'),
    consumerDocument: peruDocument('DNI de 8 dígitos o CE válido.'),
    consumerEmail: z.string().trim().toLowerCase().email('Ingresa un correo válido.').max(160),
    consumerPhone: peruPhone.optional(),
    consumerAddress: required(200, 'Indica tu dirección.'),
    isMinor: z.boolean().default(false),
    guardianName: optional(120),
    guardianDocument: peruDocument('DNI de 8 dígitos o CE válido del apoderado.'),
    productOrService: required(160, 'Indica el producto o servicio contratado.'),
    amount: z
      .union([z.number(), z.string()])
      .optional()
      .transform(value => (value === undefined || value === '' ? undefined : Number(value)))
      .refine(value => value === undefined || (Number.isFinite(value) && value >= 0), 'Ingresa un monto válido.'),
    detail: required(2000, 'Cuéntanos qué pasó.'),
    consumerRequest: required(1000, 'Indica qué esperas que hagamos.')
  })
  .refine(data => !data.isMinor || (data.guardianName && data.guardianDocument), {
    message: 'Si el consumidor es menor de edad, indica el nombre y documento del apoderado.',
    path: ['guardianName']
  });

export type ComplaintForm = z.input<typeof complaintSchema>;
export type Complaint = z.output<typeof complaintSchema>;
