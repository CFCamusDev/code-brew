import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { Quote } from '../shop/checkout';
import { formatOrderNumber } from '../shop/format';
import * as culqi from './culqi';
import { getDb } from './db';
import { orderItems, orders, payments, productVariants, stockMovements } from './db/schema';
import { sendOrderPaidEmails } from './email';
import { getOrder, quoteOrder } from './shop';

const CULQI_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** ¿Hay stock para todas las líneas, a precios/zona vigentes? Se revisa antes de cobrar; el descuento real ocurre al confirmar el pago. */
async function stockIssue(order: Order): Promise<{ message: string; issues: Quote['issues'] } | null> {
  const quote = await quoteOrder(getDb(), order);
  if (!quote.issues.length) return null;
  return { message: 'Uno de los cafés de tu pedido se agotó. Ajusta tu pedido abajo o escríbenos por WhatsApp.', issues: quote.issues };
}

/**
 * Marca el pedido como pagado y descuenta stock en una sola transacción.
 * Idempotente: si llega dos veces (respuesta del cargo + webhook) solo actúa la primera.
 */
async function markPaid(orderId: string, payment: { reference: string; method: string; amountCents: number; raw: unknown }) {
  const changed = await getDb().transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new Error(`Pedido ${orderId} no existe`);
    const [previous] = await tx
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.providerReference, payment.reference));

    await tx
      .insert(payments)
      .values({
        orderId,
        providerReference: payment.reference,
        method: payment.method,
        status: 'paid',
        amountCents: payment.amountCents,
        raw: payment.raw
      })
      .onConflictDoUpdate({ target: payments.providerReference, set: { status: 'paid', raw: payment.raw } });

    if (order.status !== 'pending') {
      // Pago nuevo sobre un pedido ya pagado o cerrado (p. ej. pagó con tarjeta y luego también el código de PagoEfectivo).
      if (previous?.status !== 'paid') {
        console.error(`[pagos] PAGO ADICIONAL ${payment.reference} para pedido ${orderId} en estado ${order.status}: revisar devolución`);
      }
      return false;
    }

    let stockShortage = false;
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      const updated = await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
        .where(and(eq(productVariants.id, item.variantId), gte(productVariants.stock, item.quantity)))
        .returning({ stock: productVariants.stock });
      if (!updated.length) {
        stockShortage = true;
        continue;
      }
      await tx.insert(stockMovements).values({
        variantId: item.variantId,
        delta: -item.quantity,
        stockAfter: updated[0].stock,
        reason: 'sale',
        orderId
      });
    }

    await tx.update(orders).set({ status: 'paid', paidAt: new Date(), stockShortage }).where(eq(orders.id, orderId));
    return true;
  });

  if (changed) {
    const order = await getOrder(orderId);
    if (order) await sendOrderPaidEmails(order);
  }
}

export type StartPaymentResult =
  | { status: 'ready'; publicKey: string; amountCents: number; culqiOrderId: string | null; email: string; orderNumber: string }
  | { status: 'paid' | 'not_found' | 'disabled' }
  | { status: 'invalid'; message: string }
  | { status: 'unavailable'; message: string; issues: Quote['issues'] };

/** Prepara el checkout de Culqi: valida el pedido y crea (o reutiliza) la orden de Culqi para pagos en efectivo y billeteras. */
export async function startPayment(orderId: string): Promise<StartPaymentResult> {
  const order = await getOrder(orderId);
  if (!order) return { status: 'not_found' };
  if (order.status === 'paid') return { status: 'paid' };
  if (order.status !== 'pending') return { status: 'invalid', message: 'Este pedido ya no admite pagos.' };
  if (!culqi.culqiEnabled()) return { status: 'disabled' };
  const issue = await stockIssue(order);
  if (issue) return { status: 'unavailable', message: issue.message, issues: issue.issues };

  const db = getDb();
  const [existing] = await db
    .select({ reference: payments.providerReference })
    .from(payments)
    .where(
      and(
        eq(payments.orderId, order.id),
        eq(payments.method, 'order'),
        eq(payments.status, 'pending'),
        eq(payments.amountCents, order.totalCents),
        gt(payments.expiresAt, new Date(Date.now() + 30 * 60 * 1000))
      )
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  let culqiOrderId = existing?.reference ?? null;
  if (!culqiOrderId) {
    const expiresAt = new Date(Date.now() + CULQI_ORDER_TTL_MS);
    const { firstName, lastName } = culqi.splitName(order.customerName);
    const response = await culqi.createOrder({
      amountCents: order.totalCents,
      // Culqi exige order_number único por intento.
      orderNumber: `${formatOrderNumber(order.number)}-${Date.now().toString(36)}`,
      orderId: order.id,
      expiresAt,
      client: { firstName, lastName, email: order.customerEmail, phone: order.customerPhone }
    });
    if (response.status === 201 && !culqi.isCulqiError(response.data)) {
      culqiOrderId = response.data.id;
      await db.insert(payments).values({
        orderId: order.id,
        providerReference: culqiOrderId,
        method: 'order',
        status: 'pending',
        amountCents: order.totalCents,
        expiresAt,
        raw: response.data
      });
    } else {
      // Sin orden el checkout igual ofrece tarjeta y Yape.
      console.warn('[culqi] no se pudo crear la orden; solo tarjeta y Yape', response.status, response.data);
    }
  }

  return {
    status: 'ready',
    publicKey: culqi.culqiPublicKey()!,
    amountCents: order.totalCents,
    culqiOrderId,
    email: order.customerEmail,
    orderNumber: formatOrderNumber(order.number)
  };
}

export type ChargeResult =
  | { status: 'paid' | '3ds_required' | 'not_found' | 'disabled' }
  | { status: 'declined' | 'invalid' | 'error'; message: string }
  | { status: 'unavailable'; message: string; issues: Quote['issues'] };

/** Cobra un token de tarjeta o Yape por el total guardado del pedido (nunca un monto enviado por el navegador). */
export async function payWithToken(
  orderId: string,
  input: { tokenId: string; email: string; deviceId?: string; authentication3DS?: Record<string, string> }
): Promise<ChargeResult> {
  const order = await getOrder(orderId);
  if (!order) return { status: 'not_found' };
  if (order.status === 'paid') return { status: 'paid' };
  if (order.status !== 'pending') return { status: 'invalid', message: 'Este pedido ya no admite pagos.' };
  if (!culqi.culqiEnabled()) return { status: 'disabled' };
  const issue = await stockIssue(order);
  if (issue) return { status: 'unavailable', message: issue.message, issues: issue.issues };

  const { firstName, lastName } = culqi.splitName(order.customerName);
  const response = await culqi.createCharge({
    amountCents: order.totalCents,
    email: input.email,
    tokenId: input.tokenId,
    deviceId: input.deviceId,
    orderNumber: formatOrderNumber(order.number),
    orderId: order.id,
    customer: {
      firstName,
      lastName,
      phone: order.customerPhone,
      address: order.shippingAddress,
      city: order.shippingCity
    },
    authentication3DS: input.authentication3DS
  });
  const data = response.data;

  if (response.status === 201 && !culqi.isCulqiError(data)) {
    if (data.amount !== order.totalCents) {
      console.error(`[culqi] cargo ${data.id} por ${data.amount} no coincide con el pedido ${order.id} (${order.totalCents})`);
      return { status: 'error', message: 'No pudimos validar el pago. Escríbenos por WhatsApp.' };
    }
    await markPaid(order.id, { reference: data.id, method: data.source?.type ?? 'card', amountCents: data.amount, raw: data });
    return { status: 'paid' };
  }

  if (response.status === 200 && !culqi.isCulqiError(data) && data.action_code === 'REVIEW') {
    return { status: '3ds_required' };
  }

  if (culqi.isCulqiError(data)) {
    await getDb()
      .insert(payments)
      .values({
        orderId: order.id,
        providerReference: data.charge_id ?? null,
        method: 'card',
        status: 'failed',
        amountCents: order.totalCents,
        raw: data
      })
      .onConflictDoNothing();
    // La documentación indica card_error (402); el sandbox responde operacion_denegada (400) con decline_code.
    if (data.type === 'card_error' || data.type === 'operacion_denegada' || data.decline_code) {
      return { status: 'declined', message: data.user_message ?? 'Tu banco rechazó el pago. Prueba con otra tarjeta o con Yape.' };
    }
    console.error('[culqi] error al crear cargo', response.status, data);
    return { status: 'error', message: data.user_message ?? 'No pudimos procesar el pago. Inténtalo de nuevo.' };
  }

  console.error('[culqi] respuesta inesperada al crear cargo', response.status, data);
  return { status: 'error', message: 'No pudimos procesar el pago. Inténtalo de nuevo.' };
}

/**
 * Procesa un cambio de estado de una orden de Culqi (webhook).
 * No confía en el cuerpo del webhook: vuelve a consultar la orden a la API de Culqi con la llave secreta.
 */
export async function syncCulqiOrder(culqiOrderId: string) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.providerReference, culqiOrderId));
  if (!payment) {
    console.warn(`[culqi] webhook de orden desconocida ${culqiOrderId}`);
    return 'ignored';
  }

  const response = await culqi.getOrder(culqiOrderId);
  if (response.status !== 200 || culqi.isCulqiError(response.data)) {
    throw new Error(`No se pudo consultar la orden ${culqiOrderId} en Culqi (${response.status})`);
  }
  const remote = response.data;

  if (remote.state === 'paid') {
    if (remote.amount !== payment.amountCents) {
      console.error(`[culqi] orden ${remote.id} pagada por ${remote.amount}, se esperaba ${payment.amountCents}`);
      return 'amount_mismatch';
    }
    await markPaid(payment.orderId, { reference: remote.id, method: 'order', amountCents: remote.amount, raw: remote });
    return 'paid';
  }
  if (remote.state === 'expired' || remote.state === 'deleted') {
    await db.update(payments).set({ status: 'failed', raw: remote }).where(eq(payments.id, payment.id));
    return remote.state;
  }
  return 'unchanged';
}
