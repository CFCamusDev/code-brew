import hotfixThumbnail from '../../assets/pipeline/optimized/hotfix-front-240.webp';
import { useEffect, useRef, useState } from 'react';
import { MAX_QUANTITY } from '../../lib/shop/limits';
import { formatPEN } from '../../lib/shop/format';
import '../../styles/shop.css';

// Integración de pago según docs.culqi.com: Checkout Custom (js.culqi.com/checkout-js) + Culqi3DS (3ds.culqi.com).

interface CulqiInstance {
  token?: { id: string; email: string };
  order?: unknown;
  error?: { user_message?: string; merchant_message?: string };
  culqi: () => void;
  open: () => void;
  close: () => void;
}
interface Culqi3DSLib {
  publicKey: string;
  settings: unknown;
  options: unknown;
  generateDevice: () => Promise<string>;
  initAuthentication: (tokenId: string) => void;
  reset: () => void;
}
declare global {
  interface Window {
    CulqiCheckout?: new (publicKey: string, config: unknown) => CulqiInstance;
    Culqi3DS?: Culqi3DSLib;
  }
}

interface LineItem {
  sku: string;
  grind: string;
  quantity: number;
  productName: string;
  format: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface OrderIssue {
  sku: string;
  message: string;
}

interface Summary {
  items: LineItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

interface Props {
  orderId: string;
  whatsappUrl: string;
  culqiEnabled: boolean;
  items: LineItem[];
  subtotalCents: number;
  shippingCents: number;
  shippingZoneName: string | null;
  totalCents: number;
}

type Session = { status: 'ready'; publicKey: string; amountCents: number; culqiOrderId: string | null; email: string; orderNumber: string };
type View =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'waiting' }
  | { kind: 'error'; message: string }
  | { kind: 'adjust'; issues: OrderIssue[]; draft: LineItem[]; error?: string; saving?: boolean };

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => {
          scripts.delete(src);
          reject(new Error(`No se pudo cargar ${src}`));
        };
        document.head.append(el);
      })
    );
  }
  return scripts.get(src)!;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

export default function OrderPaymentPanel({ orderId, whatsappUrl, culqiEnabled, items, subtotalCents, shippingCents, shippingZoneName, totalCents }: Props) {
  const [summary, setSummary] = useState<Summary>({ items, subtotalCents, shippingCents, totalCents });
  const [view, setView] = useState<View>({ kind: 'idle' });
  const pending = useRef<{ tokenId: string; email: string; deviceId?: string } | null>(null);

  const finish = (result: { status?: string; message?: string }) => {
    window.Culqi3DS?.reset();
    if (result.status === 'paid') {
      setView({ kind: 'busy', message: '¡Pago confirmado! Actualizando…' });
      window.location.reload();
    } else {
      setView({ kind: 'error', message: result.message ?? 'No pudimos procesar el pago. Inténtalo de nuevo.' });
    }
  };

  const charge = async (extra: { authentication3DS?: Record<string, string> } = {}) => {
    const { status, data } = await postJson('/api/payments/charge', { orderId, ...pending.current, ...extra });
    if (status === 200 && data.status === '3ds_required' && !extra.authentication3DS) return data;
    finish(data);
    return data;
  };

  // Respuesta de la autenticación 3DS del banco.
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !pending.current) return;
      const { parameters3DS, error } = (event.data ?? {}) as { parameters3DS?: Record<string, string>; error?: string };
      if (parameters3DS) {
        setView({ kind: 'busy', message: 'Confirmando el pago con tu banco…' });
        await charge({ authentication3DS: parameters3DS });
      } else if (error) {
        finish({ message: 'No se pudo completar la verificación de tu banco. Inténtalo de nuevo.' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  // Pagos por orden (PagoEfectivo, billeteras): esperamos al webhook consultando el estado.
  useEffect(() => {
    if (view.kind !== 'waiting') return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/orders/${orderId}/status`).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (data?.status && data.status !== 'pending') window.location.reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [view.kind, orderId]);

  const pay = async () => {
    setView({ kind: 'busy', message: 'Preparando el pago seguro…' });
    try {
      const { status, data } = await postJson('/api/payments/session', { orderId });
      if (data.status === 'paid') return window.location.reload();
      if (data.status === 'unavailable') {
        setView({ kind: 'adjust', issues: data.issues ?? [], draft: summary.items.map(item => ({ ...item })) });
        return;
      }
      if (status !== 200 || data.status !== 'ready') {
        return setView({
          kind: 'error',
          message: data.message ?? (data.status === 'disabled' ? 'El pago en línea no está disponible ahora mismo.' : 'No pudimos iniciar el pago.')
        });
      }
      const session = data as Session;

      await Promise.all([loadScript('https://js.culqi.com/checkout-js'), loadScript('https://3ds.culqi.com')]);
      const { CulqiCheckout, Culqi3DS } = window;
      if (!CulqiCheckout || !Culqi3DS) throw new Error('Culqi no cargó');

      Culqi3DS.publicKey = session.publicKey;
      Culqi3DS.options = { showModal: true, showLoading: true, showIcon: true, style: { btnColor: '#203c32', btnTextColor: '#f4f1e9' } };
      const deviceId = await Culqi3DS.generateDevice().catch(() => undefined);

      const withOrder = Boolean(session.culqiOrderId);
      const paymentMethods = { tarjeta: true, yape: true, billetera: withOrder, bancaMovil: withOrder, agente: withOrder, cuotealo: false };
      const culqi = new CulqiCheckout(session.publicKey, {
        settings: {
          title: `CodeBrew · ${session.orderNumber}`,
          currency: 'PEN',
          amount: session.amountCents,
          ...(session.culqiOrderId ? { order: session.culqiOrderId } : {})
        },
        client: { email: session.email },
        options: {
          lang: 'auto',
          installments: false,
          modal: true,
          paymentMethods,
          paymentMethodsSort: Object.keys(paymentMethods)
        },
        appearance: {
          menuType: 'sidebar',
          defaultStyle: {
            bannerColor: '#203c32',
            buttonBackground: '#203c32',
            buttonTextColor: '#f4f1e9',
            menuColor: '#203c32',
            linksColor: '#d16c40',
            priceColor: '#203c32'
          }
        }
      });

      culqi.culqi = async () => {
        if (culqi.token) {
          culqi.close();
          pending.current = { tokenId: culqi.token.id, email: culqi.token.email, deviceId };
          setView({ kind: 'busy', message: 'Procesando tu pago…' });
          const result = await charge().catch(() => {
            finish({ message: 'Se perdió la conexión al procesar el pago. Revisa tu pedido antes de reintentar.' });
            return { status: 'error' };
          });
          if (result.status === '3ds_required') {
            setView({ kind: 'busy', message: 'Tu banco pide una verificación adicional…' });
            Culqi3DS.settings = {
              charge: { totalAmount: session.amountCents, returnUrl: window.location.href, currency: 'PEN' },
              card: { email: culqi.token.email }
            };
            Culqi3DS.initAuthentication(culqi.token.id);
          }
        } else if (culqi.order) {
          culqi.close();
          setView({ kind: 'waiting' });
        } else if (culqi.error) {
          setView({ kind: 'error', message: culqi.error.user_message ?? 'No se pudo procesar el pago.' });
        }
      };

      setView({ kind: 'idle' });
      culqi.open();
    } catch (error) {
      console.error(error);
      setView({ kind: 'error', message: 'No pudimos abrir la pasarela de pago. Revisa tu conexión e inténtalo de nuevo.' });
    }
  };

  const setDraftQuantity = (sku: string, grind: string, quantity: number) => {
    if (view.kind !== 'adjust') return;
    if (quantity < 1) return removeDraftLine(sku, grind);
    setView({ ...view, draft: view.draft.map(line => (line.sku === sku && line.grind === grind ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line)) });
  };

  const removeDraftLine = (sku: string, grind: string) => {
    if (view.kind !== 'adjust') return;
    setView({ ...view, draft: view.draft.filter(line => !(line.sku === sku && line.grind === grind)) });
  };

  const saveAdjustment = async () => {
    if (view.kind !== 'adjust' || view.draft.length === 0) return;
    setView({ ...view, saving: true, error: undefined });
    const { status, data } = await postJson(`/api/orders/${orderId}/items`, {
      items: view.draft.map(line => ({ sku: line.sku, grind: line.grind, quantity: line.quantity }))
    });
    if (status === 200) {
      setSummary(data as Summary);
      setView({ kind: 'idle' });
      return;
    }
    setView({ kind: 'adjust', issues: data.issues ?? [], draft: view.draft, error: data.error ?? 'No pudimos actualizar tu pedido.' });
  };

  const issueFor = (issues: OrderIssue[], sku: string) => issues.find(issue => issue.sku === sku);

  if (view.kind === 'waiting') {
    return (
      <div className="pay-status" role="status">
        <p>
          <strong>Completa el pago con el código o la app que te indicó Culqi.</strong>
        </p>
        <p>Esta página se actualizará sola cuando recibamos la confirmación. También te enviaremos un correo.</p>
      </div>
    );
  }

  return (
    <>
      <section className="order-card">
        <h2>Tu café</h2>
        {view.kind === 'adjust' ? (
          <>
            <p className="field-error" role="alert">
              {view.error ?? 'Algo de tu pedido ya no tiene stock suficiente. Ajusta las cantidades para continuar.'}
            </p>
            <ul className="cart-lines">
              {view.draft.map(line => (
                <li key={`${line.sku}|${line.grind}`} className="cart-line">
                  <div>
                    <p className="cart-line-name">{line.productName}</p>
                    <p className="cart-line-meta">
                      {line.format} · {line.grind}
                    </p>
                    {issueFor(view.issues, line.sku) && <p className="field-error">{issueFor(view.issues, line.sku)!.message}</p>}
                    <div className="qty" role="group" aria-label={`Cantidad de ${line.productName}`}>
                      <button type="button" onClick={() => setDraftQuantity(line.sku, line.grind, line.quantity - 1)} aria-label="Quitar uno">
                        −
                      </button>
                      <span aria-live="polite">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setDraftQuantity(line.sku, line.grind, line.quantity + 1)}
                        disabled={line.quantity >= MAX_QUANTITY}
                        aria-label="Agregar uno"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-line-side">
                    <span>{formatPEN(line.unitPriceCents * line.quantity)}</span>
                    <button type="button" className="cart-remove" onClick={() => removeDraftLine(line.sku, line.grind)}>
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {view.draft.length === 0 ? (
              <p className="cart-hint">
                Tu pedido se quedaría sin productos. Si quieres cancelarlo por completo, <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">escríbenos por WhatsApp</a>.
              </p>
            ) : (
              <div className="order-actions">
                <button type="button" className="button primary" onClick={saveAdjustment} disabled={view.saving}>
                  {view.saving ? 'Actualizando…' : 'Actualizar pedido'} <span aria-hidden="true">↗</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="cart-lines">
              {summary.items.map(item => (
                <li key={`${item.sku}|${item.grind}`} className="cart-line">
                  {item.sku.startsWith("monteverde-") && <img className="cb-cart-thumb" src={hotfixThumbnail.src} width={64} height={86} alt="Bolsa Hotfix" />}
                  <div>
                    <p className="cart-line-name">
                      {item.productName} <span className="cart-line-qty">× {item.quantity}</span>
                    </p>
                    <p className="cart-line-meta">
                      {item.format} · {item.grind}
                    </p>
                  </div>
                  <span>{formatPEN(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPEN(summary.subtotalCents)}</dd>
              </div>
              <div>
                <dt>Envío ({shippingZoneName})</dt>
                <dd>{summary.shippingCents === 0 ? 'Gratis' : formatPEN(summary.shippingCents)}</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd>{formatPEN(summary.totalCents)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>

      {view.kind !== 'adjust' && (
        <section className="order-card">
          <h2>Siguiente paso: el pago</h2>
          <p>Guardamos tu pedido; reservamos tu café en cuanto se confirme el pago.</p>
          {culqiEnabled ? (
            <div className="pay-box">
              <div className="order-actions">
                <button type="button" className="button primary" onClick={pay} disabled={view.kind === 'busy'}>
                  {view.kind === 'busy' ? view.message : 'Pagar ahora'} <span aria-hidden="true">↗</span>
                </button>
                <a className="order-alt" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  ¿Problemas? Escríbenos por WhatsApp ↗
                </a>
              </div>
              <p className="cart-hint">Tarjeta de crédito o débito, Yape, billeteras, banca móvil o agentes. Pago procesado por Culqi.</p>
              {view.kind === 'error' && (
                <p className="field-error" role="alert">
                  {view.message}
                </p>
              )}
            </div>
          ) : (
            <>
              <p>Escríbenos por WhatsApp con tu número de pedido y te indicamos cómo pagar.</p>
              <div className="order-actions">
                <a className="button primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  Coordinar pago por WhatsApp <span aria-hidden="true">↗</span>
                </a>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
