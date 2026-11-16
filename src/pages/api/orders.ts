import type { APIRoute } from 'astro';
import { z } from 'zod';
import type { CartIssuesErrorResponse } from '../../contracts/cart';
import { createOrderSchema, type CreateOrderResponse } from '../../contracts/checkout';
import { CartIssuesError, orderingFor } from '../../server/modules/ordering';
import { unitOfWork } from '../../server/shared';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Revisa los datos del formulario.', fields: z.flattenError(parsed.error) }, { status: 400 });
  }

  try {
    const order = await unitOfWork.run(tx => orderingFor(tx).createOrder(parsed.data.items, parsed.data.customer));
    return Response.json({ id: order.id, number: order.number } satisfies CreateOrderResponse, { status: 201 });
  } catch (error) {
    if (error instanceof CartIssuesError) {
      return Response.json({ error: 'Revisa tu pedido antes de confirmarlo.', issues: error.issues } satisfies CartIssuesErrorResponse, { status: 409 });
    }
    throw error;
  }
};
