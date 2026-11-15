import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Quote } from '../shop/checkout';
import { formatOrderNumber } from '../shop/format';
import { getDb } from './db';
import { payments } from './db/schema';
import { sendOrderPaidEmails } from './email';
import { orderingFor } from '../../server/modules/ordering';
import { confirmOrderPayment, getPaymentGateway, type ConfirmedPayment } from '../../server/modules/payments';
import { logger } from './logger';
import { getOrder } from './shop';

const CULQI_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** ¿Hay stock para todas las líneas, a precios/zona vigentes? Se revisa antes de cobrar; el descuento real ocurre al confirmar el pago. */
async function stockIssue(order: Order): Promise<{ message: string; issues: Quote['issues'] } | null> {
  const quote = await orderingFor(getDb()).quoteOrder(order);
  if (!quote.issues.length) return null;
  return { message: 'Uno de los cafés de tu pedido se agotó. Ajusta tu pedido abajo o escríbenos por WhatsApp.', issues: quote.issues };
}

/**
 * Marca el pedido como pagado y descuenta stock (caso de uso ConfirmarPago, en una transacción).
 * Idempotente: si llega dos veces (respuesta del cargo + webhook) solo actúa la primera. Los correos salen después.
 */
async function markPaid(orderId: string, payment: ConfirmedPayment) {
  const outcome = await confirmOrderPayment(orderId, payment);
  if (outcome === 'additional_payment') {
    // Pago nuevo sobre un pedido ya pagado o cerrado (p. ej. pagó con tarjeta y luego también el código de PagoEfectivo).
    logger.error('[pagos] pago adicional: revisar devolución', new Error(`Pago adicional ${payment.reference} sobre un pedido ya cerrado`), { reference: payment.reference, orderId });
  }
  if (outcome === 'confirmed') {
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
  const gateway = getPaymentGateway();
  if (!gateway.isEnabled()) return { status: 'disabled' };
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
    const created = await gateway.createOrder({
      amountCents: order.totalCents,
      // La pasarela exige order_number único por intento.
      orderNumber: `${formatOrderNumber(order.number)}-${Date.now().toString(36)}`,
      orderId: order.id,
      expiresAt,
      client: { fullName: order.customerName, email: order.customerEmail, phone: order.customerPhone }
    });
    if (created.ok) {
      culqiOrderId = created.order.id;
      await db.insert(payments).values({
        orderId: order.id,
        providerReference: culqiOrderId,
        method: 'order',
        status: 'pending',
        amountCents: order.totalCents,
        expiresAt,
        raw: created.order.raw
      });
    } else {
      // Sin orden el checkout igual ofrece tarjeta y Yape.
      logger.warn('[culqi] no se pudo crear la orden; solo tarjeta y Yape', { status: created.status });
    }
  }

  return {
    status: 'ready',
    publicKey: gateway.publicKey()!,
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
  const gateway = getPaymentGateway();
  if (!gateway.isEnabled()) return { status: 'disabled' };
  const issue = await stockIssue(order);
  if (issue) return { status: 'unavailable', message: issue.message, issues: issue.issues };

  const outcome = await gateway.charge({
    amountCents: order.totalCents,
    email: input.email,
    tokenId: input.tokenId,
    deviceId: input.deviceId,
    orderNumber: formatOrderNumber(order.number),
    orderId: order.id,
    customer: { fullName: order.customerName, phone: order.customerPhone, address: order.shippingAddress, city: order.shippingCity },
    authentication3DS: input.authentication3DS
  });

  switch (outcome.kind) {
    case 'paid':
      if (outcome.amountCents !== order.totalCents) {
        logger.error('[culqi] el monto del cargo no coincide con el pedido', new Error(`Cargo ${outcome.chargeId} por ${outcome.amountCents}, pedido por ${order.totalCents}`), { orderId: order.id, chargeId: outcome.chargeId });
        return { status: 'error', message: 'No pudimos validar el pago. Escríbenos por WhatsApp.' };
      }
      await markPaid(order.id, { reference: outcome.chargeId, method: outcome.method, amountCents: outcome.amountCents, raw: outcome.raw });
      return { status: 'paid' };

    case 'requires_3ds':
      return { status: '3ds_required' };

    case 'declined':
    case 'failed':
      await getDb()
        .insert(payments)
        .values({
          orderId: order.id,
          providerReference: outcome.chargeId ?? null,
          method: 'card',
          status: 'failed',
          amountCents: order.totalCents,
          raw: outcome.raw
        })
        .onConflictDoNothing();
      if (outcome.kind === 'declined') {
        return { status: 'declined', message: outcome.userMessage ?? 'Tu banco rechazó el pago. Prueba con otra tarjeta o con Yape.' };
      }
      logger.error('[culqi] error al crear cargo', new Error('Culqi no pudo crear el cargo'), { orderId: order.id, chargeId: outcome.chargeId });
      return { status: 'error', message: outcome.userMessage ?? 'No pudimos procesar el pago. Inténtalo de nuevo.' };

    default:
      logger.error('[culqi] respuesta inesperada al crear cargo', new Error(`Culqi respondió ${outcome.status}`), { orderId: order.id, status: outcome.status });
      return { status: 'error', message: 'No pudimos procesar el pago. Inténtalo de nuevo.' };
  }
}

/**
 * Procesa un cambio de estado de una orden de Culqi (webhook).
 * No confía en el cuerpo del webhook: vuelve a consultar la orden a la API de Culqi con la llave secreta.
 */
export async function syncCulqiOrder(culqiOrderId: string) {
  const db = getDb();
  const [payment] = await db.select().from(payments).where(eq(payments.providerReference, culqiOrderId));
  if (!payment) {
    logger.warn('[culqi] webhook de orden desconocida', { culqiOrderId });
    return 'ignored';
  }

  const fetched = await getPaymentGateway().fetchOrder(culqiOrderId);
  if (!fetched.ok) {
    throw new Error(`No se pudo consultar la orden ${culqiOrderId} en Culqi (${fetched.status})`);
  }
  const remote = fetched.order;

  if (remote.state === 'paid') {
    if (remote.amountCents !== payment.amountCents) {
      logger.error('[culqi] el monto de la orden pagada no coincide', new Error(`Orden ${remote.id} pagada por ${remote.amountCents}, se esperaba ${payment.amountCents}`), { orderId: payment.orderId, culqiOrderId: remote.id });
      return 'amount_mismatch';
    }
    await markPaid(payment.orderId, { reference: remote.id, method: 'order', amountCents: remote.amountCents, raw: remote.raw });
    return 'paid';
  }
  if (remote.state === 'expired' || remote.state === 'deleted') {
    await db.update(payments).set({ status: 'failed', raw: remote.raw }).where(eq(payments.id, payment.id));
    return remote.state;
  }
  return 'unchanged';
}
