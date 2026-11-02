import { ADMIN_EMAIL, EMAIL_FROM, RESEND_API_KEY, SITE_URL } from 'astro:env/server';
import { formatComplaintNumber, formatOrderNumber, formatPEN } from '../shop/format';
import type { getOrder } from './shop';

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** Correo legal fijo del Libro de Reclamaciones (Indecopi exige avisar al negocio); no es el ADMIN_EMAIL editable del panel. */
const COMPLAINTS_NOTICE_EMAIL = 'codebrewc@gmail.com';

const escape = (value: string) =>
  value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Envía con Resend. Sin RESEND_API_KEY/EMAIL_FROM solo lo registra en los logs. Nunca lanza: un correo no debe romper un pago. */
async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.info(`[email] (desactivado) para ${to}: ${subject}`);
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) console.error(`[email] Resend respondió ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error('[email] no se pudo enviar', error);
  }
}

function orderSummary(order: Order) {
  const rows = order.items
    .map(
      item =>
        `<tr><td style="padding:6px 0">${escape(item.productName)} ${escape(item.format)} · ${escape(item.grind)} × ${item.quantity}</td><td style="padding:6px 0;text-align:right">${formatPEN(item.lineTotalCents)}</td></tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding:6px 0;border-top:1px solid #d9dcd0">Envío (${escape(order.shippingZoneName ?? '')})</td><td style="padding:6px 0;border-top:1px solid #d9dcd0;text-align:right">${order.shippingCents === 0 ? 'Gratis' : formatPEN(order.shippingCents)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:700">Total</td><td style="padding:6px 0;text-align:right;font-weight:700">${formatPEN(order.totalCents)}</td></tr>
  </table>`;
}

function layout(title: string, body: string) {
  return `<div style="background:#f4f1e9;padding:32px 16px;font-family:Arial,sans-serif;color:#203c32">
  <div style="max-width:560px;margin:auto;background:#faf8f3;border:1px solid #d9dcd0;padding:28px">
    <p style="font-weight:800;font-size:22px;margin:0 0 20px">codebrew</p>
    <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>${body}
    <p style="font-size:12px;color:#687269;margin-top:28px">Buen café. Mejor código.</p>
  </div></div>`;
}

export async function sendOrderPaidEmails(order: Order) {
  const number = formatOrderNumber(order.number);
  const link = SITE_URL ? `${SITE_URL.replace(/\/$/, '')}/pedido/${order.id}` : null;
  const address = `${escape(order.shippingAddress)}, ${escape(order.shippingDistrict)}, ${escape(order.shippingCity)}, ${escape(order.shippingRegion)}`;

  await sendEmail(
    order.customerEmail,
    `Recibimos tu pago · Pedido ${number}`,
    layout(
      `¡Gracias, ${escape(order.customerName.split(' ')[0])}! Tu pago está confirmado.`,
      `<p style="font-size:14px;line-height:1.6">Ya estamos preparando tu café. Te avisaremos cuando salga hacia <strong>${address}</strong>.</p>
      ${orderSummary(order)}
      ${link ? `<p style="margin-top:20px"><a href="${link}" style="color:#d16c40">Ver mi pedido ${number}</a></p>` : ''}`
    )
  );

  if (ADMIN_EMAIL) {
    await sendEmail(
      ADMIN_EMAIL,
      `${order.stockShortage ? '⚠ REVISAR STOCK · ' : ''}Nueva venta ${number} · ${formatPEN(order.totalCents)}`,
      layout(
        `Nueva venta ${number}`,
        `${order.stockShortage ? '<p style="color:#b4532a;font-weight:700">El stock no alcanzaba al confirmar el pago. Revisa el inventario antes de despachar.</p>' : ''}
        <p style="font-size:14px;line-height:1.6">${escape(order.customerName)} · ${escape(order.customerPhone)} · ${escape(order.customerEmail)}<br>${address}${order.shippingReference ? `<br>Ref.: ${escape(order.shippingReference)}` : ''}${order.notes ? `<br>Notas: ${escape(order.notes)}` : ''}</p>
        ${orderSummary(order)}`
      )
    );
  }
}

export async function sendOrderShippedEmail(order: Order) {
  const number = formatOrderNumber(order.number);
  const link = SITE_URL ? `${SITE_URL.replace(/\/$/, '')}/pedido/${order.id}` : null;
  const tracking = [order.carrier, order.trackingNumber].filter(Boolean).map(value => escape(value!)).join(' · ');
  await sendEmail(
    order.customerEmail,
    `Tu café va en camino · Pedido ${number}`,
    layout(
      `¡Tu pedido ${number} salió!`,
      `<p style="font-size:14px;line-height:1.6">Ya despachamos tu café hacia ${escape(order.shippingDistrict)}, ${escape(order.shippingCity)}.${tracking ? `<br>Seguimiento: <strong>${tracking}</strong>` : ''}</p>
      ${orderSummary(order)}
      ${link ? `<p style="margin-top:20px"><a href="${link}" style="color:#d16c40">Ver mi pedido</a></p>` : ''}`
    )
  );
}

interface ComplaintForEmail {
  year: number;
  sequence: number;
  type: 'reclamo' | 'queja';
  consumerName: string;
  consumerEmail: string;
  productOrService: string;
  detail: string;
  consumerRequest: string;
}

/** Copia al consumidor y aviso al negocio (obligatorio por Indecopi) al registrar un reclamo o queja. */
export async function sendComplaintEmails(complaint: ComplaintForEmail) {
  const number = formatComplaintNumber(complaint);
  const kind = complaint.type === 'reclamo' ? 'reclamo' : 'queja';
  const body = `<p style="font-size:14px;line-height:1.6">Bien contratado: ${escape(complaint.productOrService)}</p>
    <p style="font-size:14px;line-height:1.6"><strong>Detalle:</strong><br>${escape(complaint.detail)}</p>
    <p style="font-size:14px;line-height:1.6"><strong>Pedido del consumidor:</strong><br>${escape(complaint.consumerRequest)}</p>`;

  await sendEmail(
    complaint.consumerEmail,
    `Registramos tu ${kind} ${number} · Libro de Reclamaciones CodeBrew`,
    layout(
      `Recibimos tu ${kind} ${number}`,
      `<p style="font-size:14px;line-height:1.6">Hola ${escape(complaint.consumerName.split(' ')[0])}, confirmamos el registro de tu ${kind} en nuestro Libro de Reclamaciones. Tienes hasta 30 días calendario para recibir nuestra respuesta.</p>
      ${body}`
    )
  );

  await sendEmail(
    COMPLAINTS_NOTICE_EMAIL,
    `Nuevo ${kind} ${number} · Libro de Reclamaciones`,
    layout(
      `Nuevo ${kind} ${number}`,
      `<p style="font-size:14px;line-height:1.6">${escape(complaint.consumerName)} · ${escape(complaint.consumerEmail)}</p>
      ${body}`
    )
  );
}
