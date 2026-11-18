import { z } from 'zod';

export const waitlistInput = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: 'Escribe un correo válido.' })),
  productSlug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Producto inválido.'),
  consent: z.literal(true, { error: 'Debes aceptar recibir el aviso de este producto.' })
}).strict();
export type WaitlistInput = z.infer<typeof waitlistInput>;
