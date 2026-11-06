import hotfixThumbnail from '../../assets/pipeline/optimized/hotfix-front-240.webp';
import { track, quoteAnalytics } from '../../lib/analytics';
import { zodResolver } from '@hookform/resolvers/zod';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { cartLines, clearCart, removeFromCart } from '../../lib/shop/cart';
import { customerSchema, REGIONS, type Customer, type CustomerForm, type Quote } from '../../lib/shop/checkout';
import { formatPEN } from '../../lib/shop/format';
import { isFreeShipping } from '../../lib/shop/shipping';
import '../../styles/shop.css';

const ZONE_REGION: Record<string, string> = { lima: 'Lima', callao: 'Callao' };


// Vista previa con la misma regla que usa el servidor; el total que se cobra siempre lo recalcula el servidor.
const isFree = (zone: Quote['zones'][number], quote: Quote) => isFreeShipping(zone, quote.subtotalCents, quote.bags);

export default function CheckoutApp() {
  const lines = useStore(cartLines);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<CustomerForm, unknown, Customer>({
    resolver: zodResolver(customerSchema),
    defaultValues: { zone: '', region: '' }
  });
  const began = useRef(false);
  useEffect(() => {
    if (quote?.lines.length && !quote.issues.length && !began.current) {
      began.current = true;
      track('begin_checkout', quoteAnalytics(quote));
    }
  }, [quote]);
  const zone = watch('zone');
  const region = watch('region');

  useEffect(() => {
    if (ZONE_REGION[zone] && !getValues('region')) setValue('region', ZONE_REGION[zone]);
  }, [zone, getValues, setValue]);

  // Recotiza con el servidor cada vez que cambian el carrito o la zona.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/cart/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: lines, zone: zone || undefined, region: region || undefined }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(String(response.status));
        setQuote(await response.json());
        setQuoteError(false);
      } catch (error) {
        if (!controller.signal.aborted) setQuoteError(true);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [lines, zone, region]);

  const onSubmit = async (customer: Customer) => {
    setSubmitError(null);
    if (quote && !quote.issues.length) track('add_shipping_info', {...quoteAnalytics(quote),shipping_tier:quote.zones.find(z=>z.slug===customer.zone)?.name ?? 'delivery'});
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: lines, customer, acceptedPolicies })
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 201) {
        clearCart();
        window.location.assign(`/pedido/${body.id}`);
        return;
      }
      // 409: stock o productos cambiaron; forzamos una nueva cotización para mostrarlo.
      if (response.status === 409) cartLines.set([...cartLines.get()]);
      setSubmitError(body.error ?? 'No pudimos registrar tu pedido. Inténtalo de nuevo.');
    } catch {
      setSubmitError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    }
  };

  if (lines.length === 0) {
    return (
      <div className="checkout-empty">
        <p className="cart-code">// carrito vacío</p>
        <h1>Aún no hay café en tu pedido.</h1>
        <a className="button primary" href="/#productos">
          Elegir mi café <span aria-hidden="true">↗</span>
        </a>
      </div>
    );
  }

  const canSubmit = quote !== null && quote.issues.length === 0 && quote.lines.length > 0 && !isSubmitting && acceptedPolicies;

  return (
    <form className="checkout" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="checkout-form">
        <p className="eyebrow">CHECKOUT / 01</p>
        <h1>Tus datos</h1>
        <div className="field-grid">
          <Field label="Nombre completo" error={errors.name} wide>
            <input {...register('name')} autoComplete="name" />
          </Field>
          <Field label="Correo" error={errors.email}>
            <input {...register('email')} type="email" autoComplete="email" inputMode="email" />
          </Field>
          <Field label="Celular" error={errors.phone}>
            <input {...register('phone')} type="tel" autoComplete="tel-national" inputMode="tel" placeholder="9XX XXX XXX" />
          </Field>
          <Field label="DNI o CE (opcional)" error={errors.document}>
            <input {...register('document')} inputMode="numeric" />
          </Field>
        </div>

        <p className="eyebrow">CHECKOUT / 02</p>
        <h2>Entrega</h2>
        <fieldset className="zones">
          <legend>Zona de envío</legend>
          {quote?.zones.map(z => (
            <label key={z.slug} className="zone-option">
              <input
                type="radio"
                value={z.slug}
                {...register('zone')}
                disabled={Boolean(region && z.regions && !z.regions.includes(region))}
              />
              <span>
                <strong>{z.name}</strong>
                <small>
                  {z.eta}
                  {z.freeFromBags !== null &&
                    (quote.bags >= z.freeFromBags
                      ? ' · Envío gratis aplicado'
                      : ` · Gratis desde ${z.freeFromBags} bolsas (te ${z.freeFromBags - quote.bags === 1 ? 'falta 1' : `faltan ${z.freeFromBags - quote.bags}`})`)}
                </small>
              </span>
              <b>
                {isFree(z, quote)
                  ? 'Gratis'
                  : z.slug === zone && region && quote.shippingCents !== null
                    ? formatPEN(quote.shippingCents)
                    : `${z.hasRegionRates ? 'desde ' : ''}${formatPEN(z.priceCents)}`}
              </b>
            </label>
          ))}
          {errors.zone && <p className="field-error">{errors.zone.message}</p>}
        </fieldset>
        <div className="field-grid">
          <Field label="Departamento" error={errors.region}>
            <select {...register('region')} autoComplete="address-level1">
              <option value="">Elige…</option>
              {REGIONS.map(region => (
                <option key={region}>{region}</option>
              ))}
            </select>
          </Field>
          <Field label="Provincia / ciudad" error={errors.city}>
            <input {...register('city')} autoComplete="address-level2" />
          </Field>
          <Field label="Distrito" error={errors.district}>
            <input {...register('district')} autoComplete="address-level3" />
          </Field>
          <Field label="Dirección" error={errors.address} wide>
            <input {...register('address')} autoComplete="street-address" placeholder="Av. / Calle, número, dpto." />
          </Field>
          <Field label="Referencia (opcional)" error={errors.reference} wide>
            <input {...register('reference')} />
          </Field>
          <Field label="Notas para tu pedido (opcional)" error={errors.notes} wide>
            <textarea {...register('notes')} rows={3} />
          </Field>
        </div>
      </div>

      <aside className="checkout-summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Resumen</h2>
        {quoteError && <p className="field-error">No pudimos actualizar precios. Reintentando al cambiar tu pedido.</p>}
        {!quote && !quoteError && <p className="cart-hint">Calculando…</p>}
        {quote && (
          <>
            <ul className="cart-lines">
              {quote.lines.map(line => (
                <li key={`${line.sku}|${line.grind}`} className="cart-line">
                  {line.sku.startsWith("monteverde-") && <img className="cb-cart-thumb" src={hotfixThumbnail.src} width={64} height={86} alt="Bolsa Hotfix" />}
                  <div>
                    <p className="cart-line-name">
                      {line.productName} <span className="cart-line-qty">× {line.quantity}</span>
                    </p>
                    <p className="cart-line-meta">
                      {line.format} · {line.grind}
                    </p>
                  </div>
                  <span>{formatPEN(line.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            {quote.issues.length > 0 && (
              <div className="issues" role="alert">
                {quote.issues.map((issue, index) => (
                  <p key={index}>
                    {issue.message}{' '}
                    {issue.sku && (
                      <button
                        type="button"
                        onClick={() => lines.filter(l => l.sku === issue.sku).forEach(l => removeFromCart(l.sku, l.grind))}
                      >
                        Quitar del carrito
                      </button>
                    )}
                  </p>
                ))}
              </div>
            )}
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPEN(quote.subtotalCents)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>{quote.shippingCents === null ? 'Elige una zona' : quote.shippingCents === 0 ? 'Gratis' : formatPEN(quote.shippingCents)}</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd>{formatPEN(quote.totalCents ?? quote.subtotalCents)}</dd>
              </div>
            </dl>
          </>
        )}
        <label className="field policy-accept">
          <span className="policy-accept-row">
            <input type="checkbox" checked={acceptedPolicies} onChange={event => setAcceptedPolicies(event.target.checked)} />
            <span>
              Acepto los{' '}
              <a href="/politicas/terminos" target="_blank" rel="noopener noreferrer">
                Términos y condiciones
              </a>{' '}
              y la{' '}
              <a href="/politicas/privacidad" target="_blank" rel="noopener noreferrer">
                Política de privacidad
              </a>
              .
            </span>
          </span>
        </label>
        <p className="policy-accept-row" style={{ marginTop: -4 }}>
          <a href="/reclamos" target="_blank" rel="noopener noreferrer">
            ¿Algún problema con tu compra? Libro de Reclamaciones
          </a>
        </p>
        {submitError && (
          <p className="field-error" role="alert">
            {submitError}
          </p>
        )}
        <button type="submit" className="button primary checkout-submit" disabled={!canSubmit}>
          {isSubmitting ? 'Registrando…' : 'Confirmar pedido'} <span aria-hidden="true">↗</span>
        </button>
        <p className="cart-hint">Al confirmar registramos tu pedido y te mostramos cómo completar el pago.</p>
      </aside>
    </form>
  );
}

function Field({ label, error, wide, children }: { label: string; error?: FieldError; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={wide ? 'field wide' : 'field'} data-invalid={error ? '' : undefined}>
      <span>{label}</span>
      {children}
      {error && <small className="field-error">{error.message}</small>}
    </label>
  );
}
