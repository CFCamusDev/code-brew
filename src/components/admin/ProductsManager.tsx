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
interface LineOption { id: number; name: string; status: string }
interface Product {
  id: number;
  name: string;
  roast: string;
  grinds: string[];
  imageUrl: string | null;
  active: boolean;
  status: 'draft' | 'upcoming' | 'active' | 'discontinued' | null;
  slug: string;
  lineId: number | null;
  tagline: string;
  releaseNumber: number | null;
  launchAt: string | null;
  variants: Variant[];
}

const post = (url: string, body: unknown) => adminPost<{ stock?: number; issues?: { code: string; message: string }[] }>(url, body);

async function uploadImage(file: File): Promise<{ url?: string; error?: string }> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/admin/products/upload-image', { method: 'POST', body }).catch(() => null);
  if (!response) return { error: 'Sin conexión. Inténtalo de nuevo.' };
  const data = await response.json().catch(() => ({}));
  return response.ok ? data : { error: data.error ?? 'No se pudo subir la imagen.' };
}

function Feedback({ state }: { state: { error?: string; ok?: string } }) {
  if (state.error) return <span className="form-error">{state.error}</span>;
  if (state.ok) return <span className="form-ok">{state.ok}</span>;
  return null;
}

function ImagePicker({
  imageUrl,
  onChange,
  disabled
}: {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    const result = await uploadImage(file);
    setBusy(false);
    if (result.error) return setError(result.error);
    onChange(result.url ?? null);
  };

  return (
    <div className="admin-image-picker">
      {imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
      ) : (
        <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--surface-2)' }} />
      )}
      <div className="actions" style={{ alignItems: 'center' }}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || busy}
          onChange={e => pick(e.target.files?.[0])}
        />
        {imageUrl && !disabled && (
          <button type="button" className="btn ghost small" onClick={() => onChange(null)} disabled={busy}>
            Quitar
          </button>
        )}
        {busy && <span className="muted">Subiendo…</span>}
        {error && <span className="form-error">{error}</span>}
      </div>
    </div>
  );
}

const stateLabels = { draft: 'Borrador', upcoming: 'Próximamente', active: 'Activo', discontinued: 'Descontinuado' };
const peruDate = (value: string | null) => value ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T') : '';
interface MetadataForm { lineId: string; tagline: string; releaseNumber: string; launchAt: string; status: keyof typeof stateLabels }
function ProductMetadata({ form, setForm, lines, launched = false, creating = false }: { form: MetadataForm; setForm: (form: MetadataForm) => void; lines: LineOption[]; launched?: boolean; creating?: boolean }) {
  return <>
    <label>Línea<select value={form.lineId} onChange={e => setForm({ ...form, lineId: e.target.value })}><option value="">Selecciona una línea</option>{lines.map(line => <option key={line.id} value={line.id}>{line.name}{line.status !== 'active' ? ' (no publicada)' : ''}</option>)}</select></label>
    <label>Frase del producto<input maxLength={160} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} /><small>Necesaria para anunciarlo como próximamente.</small></label>
    <div className="row">
      <label>Estado<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as keyof typeof stateLabels })}>{Object.entries(stateLabels).filter(([value]) => !creating || ['draft','upcoming'].includes(value)).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Número de entrega<input type="number" min={1} max={2147483647} step={1} value={form.releaseNumber} onChange={e => setForm({ ...form, releaseNumber: e.target.value })} /></label>
    </div>
    <label>Fecha de lanzamiento (hora de Perú)<input type="datetime-local" disabled={launched} value={form.launchAt} onChange={e => setForm({ ...form, launchAt: e.target.value })} /><small>{launched ? 'Se conserva la fecha del primer lanzamiento.' : 'La fecha informa del lanzamiento previsto; no publica automáticamente.'}</small></label>
  </>;
}
const metadataBody = (form: MetadataForm) => ({ lineId: form.lineId ? Number(form.lineId) : null, tagline: form.tagline, releaseNumber: form.releaseNumber ? Number(form.releaseNumber) : null, launchAt: form.launchAt ? new Date(form.launchAt + ':00-05:00').toISOString() : null, status: form.status });

function ProductHeader({ product, canEdit, lines }: { product: Product; canEdit: boolean; lines: LineOption[] }) {
  const [form, setForm] = useState({
    name: product.name,
    roast: product.roast,
    grinds: product.grinds.join('\n'),
    imageUrl: product.imageUrl,
    active: product.active,
    lineId: product.lineId?.toString() ?? '', tagline: product.tagline, releaseNumber: product.releaseNumber?.toString() ?? '', launchAt: peruDate(product.launchAt), status: product.status ?? (product.active ? 'active' : 'draft')
  });
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<{ code: string; message: string }[]>([]);

  const save = async () => {
    setBusy(true);
    const grinds = form.grinds.split('\n').map(g => g.trim()).filter(Boolean);
    const result = await post(`/api/admin/products/${product.id}`, { name: form.name, roast: form.roast, imageUrl: form.imageUrl, grinds, ...metadataBody(form), launchAt: ['active','discontinued'].includes(product.status ?? '') ? product.launchAt : metadataBody(form).launchAt });
    setBusy(false);
    setState(result.error ? { error: result.error } : { ok: 'Guardado.' });
    setIssues(result.issues ?? []);
    if (!result.error) window.location.reload();
  };

  const publish = async () => {
    setBusy(true);
    setIssues([]);
    const target = form.active ? 'discontinued' : 'active';
    const result = target === 'discontinued' && product.status === null
      ? await post(`/api/admin/products/${product.id}`, { name: form.name, roast: form.roast, imageUrl: form.imageUrl, active: false, grinds: form.grinds.split('\n').map(value => value.trim()).filter(Boolean) })
      : await post(`/api/admin/products/${product.id}/status`, { status: target });
    setBusy(false);
    setState(result.error ? { error: result.error } : { ok: target === 'active' ? 'Producto activado.' : 'Producto descontinuado.' });
    setIssues(result.issues ?? []);
    if (!result.error) window.location.reload();
  };

  if (!canEdit) {
    return (
      <div>
        <h2>
          {product.name} <span className="badge">{product.status ? stateLabels[product.status] : product.active ? 'Activo' : 'Sin venta activa'}</span>
        </h2>
        <p className="muted">
          {product.roast} · Moliendas: {product.grinds.join(', ')}
        </p>
      </div>
    );
  }
  return (
    <div className="admin-form">
      <h2>{product.name}</h2>
      <ProductMetadata form={form} setForm={value => setForm({ ...form, ...value })} lines={lines} launched={product.status === 'active' || product.status === 'discontinued'} />
      <a className="btn ghost small" href={`/admin/productos/preview?slug=${encodeURIComponent(product.slug)}`} target="_blank" rel="noopener noreferrer">Vista previa</a>
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
      <label>
        Imagen del producto
        <ImagePicker imageUrl={form.imageUrl} onChange={url => setForm({ ...form, imageUrl: url })} />
      </label>
      <div className="actions" style={{ alignItems: 'center' }}>
        <span className="badge">{product.status ? stateLabels[product.status] : form.active ? 'Activo' : 'Sin venta activa'}</span>
        <button type="button" className="btn small ghost" onClick={publish} disabled={busy}>{form.active ? 'Descontinuar' : 'Activar'}</button>
        <button type="button" className="btn small" onClick={save} disabled={busy}>
          Guardar perfil
        </button>
        <Feedback state={state} />
      </div>
      <small className="muted">Guarda los cambios del perfil antes de activar o abrir la vista previa. La activación valida los datos guardados.</small>
      {issues.length > 0 && <ul className="form-error" role="alert">{issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}
    </div>
  );
}

function NewVariantForm({ productId, onCreated }: { productId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ format: '', price: '', stock: '0', bags: '1' });
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const priceCents = Math.round(Number(form.price.replace(',', '.')) * 100);
    if (!Number.isFinite(priceCents)) return setState({ error: 'Precio inválido.' });
    const stock = Number.parseInt(form.stock, 10);
    const bags = Number.parseInt(form.bags, 10);
    if (!Number.isInteger(stock) || !Number.isInteger(bags)) return setState({ error: 'Stock y bolsas deben ser números.' });
    setBusy(true);
    const result = await post('/api/admin/products/variants', { productId, format: form.format, priceCents, stock, bags });
    setBusy(false);
    if (result.error) return setState({ error: result.error });
    setState({ ok: 'Presentación creada.' });
    setForm({ format: '', price: '', stock: '0', bags: '1' });
    setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
        + Nueva presentación
      </button>
    );
  }
  return (
    <div className="admin-form" style={{ marginTop: 8 }}>
      <div className="row">
        <label>
          Formato
          <input placeholder="250 g" value={form.format} maxLength={40} onChange={e => setForm({ ...form, format: e.target.value })} />
        </label>
        <label>
          Precio (S/)
          <input inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
        </label>
        <label>
          Stock inicial
          <input type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
        </label>
        <label>
          Bolsas
          <input type="number" min={1} max={20} value={form.bags} onChange={e => setForm({ ...form, bags: e.target.value })} />
        </label>
      </div>
      <div className="actions" style={{ alignItems: 'center' }}>
        <button type="button" className="btn small" onClick={create} disabled={busy}>
          Crear presentación
        </button>
        <button type="button" className="btn ghost small" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </button>
        <Feedback state={state} />
      </div>
    </div>
  );
}

function NewProductForm({ onCreated, lines }: { onCreated: () => void; lines: LineOption[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', roast: '', grinds: '', imageUrl: null as string | null, lineId: '', tagline: '', releaseNumber: '', launchAt: '', status: 'draft' as keyof typeof stateLabels });
  const [state, setState] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const grinds = form.grinds.split('\n').map(g => g.trim()).filter(Boolean);
    if (!form.lineId || !form.name.trim() || !form.roast.trim() || grinds.length === 0) {
      return setState({ error: 'Completa línea, nombre, tueste y al menos una molienda.' });
    }
    setBusy(true);
    const result = await post('/api/admin/products', { name: form.name, roast: form.roast, grinds, imageUrl: form.imageUrl, ...metadataBody(form) });
    setBusy(false);
    if (result.error) return setState({ error: result.error });
    setState({ ok: 'Producto creado.' });
    setForm({ name: '', roast: '', grinds: '', imageUrl: null, lineId: '', tagline: '', releaseNumber: '', launchAt: '', status: 'draft' as keyof typeof stateLabels });
    setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)}>
        + Nuevo producto
      </button>
    );
  }
  return (
    <section className="admin-card">
      <h2>Nuevo producto</h2>
      <div className="admin-form">
        <ProductMetadata form={form} setForm={value => setForm({ ...form, ...value })} lines={lines} creating />
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
        <label>
          Imagen del producto
          <ImagePicker imageUrl={form.imageUrl} onChange={url => setForm({ ...form, imageUrl: url })} />
        </label>
        <div className="actions" style={{ alignItems: 'center' }}>
          <button type="button" className="btn small" onClick={create} disabled={busy}>
            Crear producto
          </button>
          <button type="button" className="btn ghost small" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </button>
          <Feedback state={state} />
        </div>
      </div>
    </section>
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
        <strong style={{ color: stock === 0 ? 'var(--danger)' : undefined }}>{stock}</strong>
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

export default function ProductsManager({ products, canEdit, lines }: { products: Product[]; canEdit: boolean; lines: LineOption[] }) {
  const reload = () => window.location.reload();
  return (
    <div className="admin-stack">
      {canEdit && <NewProductForm onCreated={reload} lines={lines} />}
      {products.map(product => (
        <section key={product.id} className="admin-card">
          <ProductHeader product={product} canEdit={canEdit} lines={lines} />
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
          {canEdit && <NewVariantForm productId={product.id} onCreated={reload} />}
        </section>
      ))}
    </div>
  );
}
