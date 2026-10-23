import { useState } from 'react';
import { formatPEN } from '../../lib/shop/format';
import { adminPost } from './request';

interface Zone {
  id: number;
  name: string;
  eta: string;
  priceCents: number;
  freeFromBags: number | null;
  freeFromCents: number | null;
  regions: string[] | null;
  active: boolean;
  rates: { id: number; region: string; priceCents: number }[];
}

const toCents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
const toSoles = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));

function ZoneCard({ zone, regions, canEdit }: { zone: Zone; regions: readonly string[]; canEdit: boolean }) {
  const [form, setForm] = useState({
    name: zone.name,
    eta: zone.eta,
    price: toSoles(zone.priceCents),
    freeFromBags: zone.freeFromBags?.toString() ?? '',
    freeFromSoles: toSoles(zone.freeFromCents),
    active: zone.active
  });
  const [rates, setRates] = useState(zone.rates);
  const [newRate, setNewRate] = useState({ region: '', price: '' });
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const available = regions.filter(region => (!zone.regions || zone.regions.includes(region)) && !rates.some(rate => rate.region === region));

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const result = await adminPost('/api/admin/shipping/zones', { zoneId: zone.id, ...body });
    setBusy(false);
    setMessage(result.error ? { error: result.error } : { ok });
    return !result.error;
  };

  const saveZone = () => {
    const priceCents = toCents(form.price);
    if (!Number.isFinite(priceCents)) return setMessage({ error: 'Tarifa inválida.' });
    run(
      {
        action: 'zone',
        name: form.name,
        eta: form.eta,
        priceCents,
        freeFromBags: form.freeFromBags ? Number(form.freeFromBags) : null,
        freeFromCents: form.freeFromSoles ? toCents(form.freeFromSoles) : null,
        active: form.active
      },
      'Zona guardada.'
    );
  };

  const addRate = async () => {
    const priceCents = toCents(newRate.price);
    if (!newRate.region || !Number.isFinite(priceCents)) return setMessage({ error: 'Elige el departamento e indica la tarifa.' });
    if (await run({ action: 'rate', region: newRate.region, priceCents }, `Tarifa para ${newRate.region} guardada.`)) {
      setRates([...rates, { id: Date.now(), region: newRate.region, priceCents }].sort((a, b) => a.region.localeCompare(b.region)));
      setNewRate({ region: '', price: '' });
    }
  };

  const removeRate = async (region: string) => {
    if (await run({ action: 'delete-rate', region }, `${region} vuelve a la tarifa base.`)) setRates(rates.filter(rate => rate.region !== region));
  };

  return (
    <section className="admin-card">
      <h2>
        {zone.name} {!zone.active && <span className="badge">Inactiva</span>}
      </h2>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Departamentos: {zone.regions ? zone.regions.join(', ') : 'todos'}
      </p>
      {canEdit ? (
        <div className="admin-form">
          <div className="row">
            <label>
              Nombre visible
              <input value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Plazo
              <input value={form.eta} maxLength={80} onChange={e => setForm({ ...form, eta: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label>
              Tarifa base (S/)
              <input inputMode="decimal" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
            </label>
            <label>
              Gratis desde N bolsas (vacío = no)
              <input inputMode="numeric" value={form.freeFromBags} onChange={e => setForm({ ...form, freeFromBags: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label>
              Gratis desde un subtotal en S/ (vacío = no)
              <input inputMode="decimal" value={form.freeFromSoles} onChange={e => setForm({ ...form, freeFromSoles: e.target.value })} />
            </label>
            <label className="check" style={{ alignSelf: 'end' }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Zona activa
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn small" onClick={saveZone} disabled={busy}>
              Guardar zona
            </button>
          </div>
        </div>
      ) : (
        <dl className="kv">
          <dt>Tarifa base</dt>
          <dd>{formatPEN(zone.priceCents)}</dd>
          <dt>Plazo</dt>
          <dd>{zone.eta}</dd>
          <dt>Envío gratis</dt>
          <dd>{zone.freeFromBags ? `Desde ${zone.freeFromBags} bolsas` : zone.freeFromCents ? `Desde ${formatPEN(zone.freeFromCents)}` : 'No'}</dd>
        </dl>
      )}

      <h2 style={{ marginTop: 20 }}>Tarifas por departamento</h2>
      {rates.length === 0 && <p className="muted">Todos los departamentos pagan la tarifa base.</p>}
      {rates.length > 0 && (
        <table className="admin-table" style={{ marginBottom: 12 }}>
          <tbody>
            {rates.map(rate => (
              <tr key={rate.region}>
                <td>{rate.region}</td>
                <td className="num">{formatPEN(rate.priceCents)}</td>
                {canEdit && (
                  <td className="num">
                    <button type="button" className="btn ghost small" onClick={() => removeRate(rate.region)} disabled={busy}>
                      Quitar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canEdit && available.length > 0 && (
        <div className="actions">
          <select className="admin-input" aria-label="Departamento" value={newRate.region} onChange={e => setNewRate({ ...newRate, region: e.target.value })}>
            <option value="">Departamento…</option>
            {available.map(region => (
              <option key={region}>{region}</option>
            ))}
          </select>
          <input
            className="admin-input"
            style={{ width: 100 }}
            inputMode="decimal"
            placeholder="S/ 0.00"
            aria-label="Tarifa"
            value={newRate.price}
            onChange={e => setNewRate({ ...newRate, price: e.target.value })}
          />
          <button type="button" className="btn ghost small" onClick={addRate} disabled={busy}>
            Agregar tarifa
          </button>
        </div>
      )}
      {(message.error || message.ok) && (
        <p className={message.error ? 'form-error' : 'form-ok'} style={{ marginTop: 10 }}>
          {message.error ?? message.ok}
        </p>
      )}
    </section>
  );
}

export default function ShippingManager({ zones, regions, canEdit }: { zones: Zone[]; regions: readonly string[]; canEdit: boolean }) {
  return (
    <div className="admin-stack">
      {zones.map(zone => (
        <ZoneCard key={zone.id} zone={zone} regions={regions} canEdit={canEdit} />
      ))}
    </div>
  );
}
