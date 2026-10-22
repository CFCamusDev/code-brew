import { useEffect, useRef, useState } from 'react';
import '../../styles/shop.css';

// Integración según docs.culqi.com: Checkout Custom (js.culqi.com/checkout-js) + Culqi3DS (3ds.culqi.com).

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

type Session = { status: 'ready'; publicKey: string; amountCents: number; culqiOrderId: string | null; email: string; orderNumber: string };
type View =
  | { kind: 'idle' }
  | { kind: 'busy'; message: string }
  | { kind: 'waiting' }
  | { kind: 'error'; message: string };

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

export default function PayButton({ orderId, whatsappUrl }: { orderId: string; whatsappUrl: string }) {
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
  );
}
