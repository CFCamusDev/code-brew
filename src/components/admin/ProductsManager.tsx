import { useState } from 'react';
import { formatPEN } from '../../lib/shop/format';
import { adminPost } from './request';

interface Variant {
  id: number;
  sku: string;
  format: string;
  priceCents: number;
  stock: number;
  bags: number;
  active: boolean;
}
interface Product {
  id: number;
  name: string;
  roast: string;
  grinds: string[];
  active: boolean;
  variants: Variant[];
}

const post = (url: string, body: unknown) => adminPost<{ stock?: number }>(url, body);

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <span className="form-error">{state.error}</span>;
  if (state.ok) return <span className="form-ok">{state.ok}</span>;
  return null;
}

function ProductHeader({ product, canEdit }: { product: Product; canEdit: boolean }) {
  const [form, setForm] = useState({ name: product.name, roast: product.roast, grinds: product.grinds.join('\n'), active: product.active });
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const grinds = form.grinds.split('\n').map(g => g.trim()).filter(Boolean);
    const result = await post(`/api/admin/products/${product.id}`, { ...form, grinds });
    setBusy(false);
    setState(result.error ? { error: result.error } : { ok: 'Guardado.' });
  };

  if (!canEdit) {
    return (
      <div>
        <h2>
          {product.name} {!product.active && <span className="badge">Oculto</span>}
        </h2>
        <p className="muted">
          {product.roast} · Moliendas: {product.grinds.join(', ')}
        </p>
      </div>
    );
  }
  return (
    <div className="admin-form">
      <div className="row">
        <label>
          Nombre
          <input value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Tueste
          <input value={form.roast} maxLength={80} onChange={e => setForm({ ...form, roast: e.target.value })} />
        </label>
      </div>
      <label>
        Moliendas disponibles (una por línea)
        <textarea rows={3} value={form.grinds} onChange={e => setForm({ ...form, grinds: e.target.value })} />
      </label>
      <div className="actions" style={{ alignItems: 'center' }}>
        <label className="check">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Disponible para la venta
        </label>
        <button type="button" className="btn small" onClick={save} disabled={busy}>
          Guardar perfil
        </button>
        <Feedback state={state} />
      </div>
    </div>
  );
}

function VariantRow({ variant, canEdit }: { variant: Variant; canEdit: boolean }) {
  const [form, setForm] = useState({
    format: variant.format,
    price: (variant.priceCents / 100).toFixed(2),
    bags: variant.bags,
    active: variant.active
  });
  const [stock, setStock] = useState(variant.stock);
  const [adjust, setAdjust] = useState({ delta: '', reason: 'adjustment', note: '' });
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const priceCents = Math.round(Number(form.price.replace(',', '.')) * 100);
    if (!Number.isFinite(priceCents)) return setState({ error: 'Precio inválido.' });
    setBusy(true);
    const result = await post(`/api/admin/products/variants/${variant.id}`, {
      action: 'update',
      format: form.format,
      priceCents,
      bags: Number(form.bags),
      active: form.active
    });
    setBusy(false);
    setState(result.error ? { error: result.error } : { ok: 'Guardado.' });
  };

  const applyStock = async () => {
    const delta = Number.parseInt(adjust.delta, 10);
    if (!Number.isInteger(delta) || delta === 0) return setState({ error: 'Indica una cantidad, p. ej. 10 o -2.' });
    setBusy(true);
    const result = await post(`/api/admin/products/variants/${variant.id}`, {
      action: 'stock',
      delta,
      reason: adjust.reason,
      note: adjust.note || undefined
    });
    setBusy(false);
    if (result.error) return setState({ error: result.error });
    setStock(result.stock ?? stock + delta);
    setAdjust({ delta: '', reason: adjust.reason, note: '' });
    setState({ ok: `Stock actualizado (${delta > 0 ? '+' : ''}${delta}).` });
  };

  return (
    <tr>
      <td>
        <code>{variant.sku}</code>
      </td>
      <td>
        {canEdit ? (
          <input className="admin-input" style={{ width: 110 }} value={form.format} onChange={e => setForm({ ...form, format: e.target.value })} />
        ) : (
          variant.format
        )}
      </td>
      <td>
        {canEdit ? (
          <input
            className="admin-input"
            style={{ width: 90 }}
            inputMode="decimal"
            aria-label={`Precio de ${variant.sku} en soles`}
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
          />
        ) : (
          formatPEN(variant.priceCents)
        )}
      </td>
      <td>
        {canEdit ? (
          <input
            className="admin-input"
            style={{ width: 60 }}
            type="number"
            min={1}
            max={20}
            aria-label={`Bolsas de ${variant.sku}`}
            value={form.bags}
            onChange={e => setForm({ ...form, bags: Number(e.target.value) })}
          />
        ) : (
          variant.bags
        )}
      </td>
      <td>
        {canEdit ? (
          <input type="checkbox" checked={form.active} aria-label={`Activa ${variant.sku}`} onChange={e => setForm({ ...form, active: e.target.checked })} />
        ) : variant.active ? (
          'Sí'
        ) : (
          'No'
        )}
      </td>
      <td className="num">
        <strong style={{ color: stock === 0 ? '#b4532a' : undefined }}>{stock}</strong>
      </td>
      <td>
        <div className="actions" style={{ flexWrap: 'nowrap' }}>
          <input
            className="admin-input"
            style={{ width: 70 }}
            inputMode="numeric"
            placeholder="+10"
            aria-label={`Cantidad a ajustar de ${variant.sku}`}
            value={adjust.delta}
            onChange={e => setAdjust({ ...adjust, delta: e.target.value })}
          />
          <select
            className="admin-input"
            aria-label="Motivo"
            value={adjust.reason}
            onChange={e => setAdjust({ ...adjust, reason: e.target.value })}
          >
            <option value="purchase">Ingreso (tueste/compra)</option>
            <option value="adjustment">Ajuste / merma</option>
          </select>
          <input
            className="admin-input"
            style={{ width: 140 }}
            placeholder="Nota"
            maxLength={300}
            aria-label="Nota del ajuste"
            value={adjust.note}
            onChange={e => setAdjust({ ...adjust, note: e.target.value })}
          />
          <button type="button" className="btn ghost small" onClick={applyStock} disabled={busy}>
            Aplicar
          </button>
        </div>
      </td>
      <td>
        <div className="actions" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          {canEdit && (
            <button type="button" className="btn small" onClick={save} disabled={busy}>
              Guardar
            </button>
          )}
          <Feedback state={state} />
        </div>
      </td>
    </tr>
  );
}

export default function ProductsManager({ products, canEdit }: { products: Product[]; canEdit: boolean }) {
  return (
    <div className="admin-stack">
      {products.map(product => (
        <section key={product.id} className="admin-card">
          <ProductHeader product={product} canEdit={canEdit} />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Presentación</th>
                  <th>Precio (S/)</th>
                  <th>Bolsas</th>
                  <th>Activa</th>
                  <th className="num">Stock</th>
                  <th>Ajustar stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.variants.map(variant => (
                  <VariantRow key={variant.id} variant={variant} canEdit={canEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
