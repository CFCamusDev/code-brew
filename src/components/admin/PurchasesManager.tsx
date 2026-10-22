import { useState } from 'react';
import { formatPEN } from '../../lib/shop/format';
import { adminPost } from './request';

interface Purchase {
  id: number;
  purchasedOn: string;
  supplier: string;
  category: string;
  description: string;
  documentNumber: string | null;
  amountCents: number;
  notes: string | null;
  adminName: string | null;
}

interface Props {
  rows: Purchase[];
  categories: Record<string, string>;
  canDelete: boolean;
  today: string;
}

function PurchaseForm({
  initial,
  categories,
  onDone,
  onCancel
}: {
  initial: Partial<Purchase> & { purchasedOn: string };
  categories: Record<string, string>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const amountCents = Math.round(Number(data.amount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountCents)) return setError('Monto inválido.');
    setBusy(true);
    const result = await adminPost('/api/admin/purchases', {
      action: initial.id ? 'update' : 'create',
      ...(initial.id ? { id: initial.id } : {}),
      purchasedOn: data.purchasedOn,
      supplier: data.supplier,
      category: data.category,
      description: data.description,
      documentNumber: data.documentNumber || undefined,
      amountCents,
      notes: data.notes || undefined
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else onDone();
  };

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="row">
        <label>
          Fecha
          <input type="date" name="purchasedOn" defaultValue={initial.purchasedOn} required />
        </label>
        <label>
          Categoría
          <select name="category" defaultValue={initial.category ?? 'cafe_verde'}>
            {Object.entries(categories).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          Proveedor
          <input name="supplier" defaultValue={initial.supplier} maxLength={120} required />
        </label>
        <label>
          Monto (S/)
          <input name="amount" inputMode="decimal" defaultValue={initial.amountCents ? (initial.amountCents / 100).toFixed(2) : ''} required />
        </label>
      </div>
      <label>
        Descripción
        <input name="description" defaultValue={initial.description} maxLength={300} placeholder="p. ej. 30 kg café verde lote Monteverde" required />
      </label>
      <div className="row">
        <label>
          N.º de boleta / factura (opcional)
          <input name="documentNumber" defaultValue={initial.documentNumber ?? ''} maxLength={40} />
        </label>
        <label>
          Notas (opcional)
          <input name="notes" defaultValue={initial.notes ?? ''} maxLength={500} />
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="actions">
        <button className="btn" type="submit" disabled={busy}>
          {initial.id ? 'Guardar cambios' : 'Registrar compra'}
        </button>
        {onCancel && (
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export default function PurchasesManager({ rows, categories, canDelete, today }: Props) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const reload = () => window.location.reload();

  const remove = async (purchase: Purchase) => {
    if (!window.confirm(`¿Borrar la compra "${purchase.description}" por ${formatPEN(purchase.amountCents)}?`)) return;
    const result = await adminPost('/api/admin/purchases', { action: 'delete', id: purchase.id });
    if (result.error) window.alert(result.error);
    else reload();
  };

  return (
    <div className="admin-stack">
      <section className="admin-card">
        {creating ? (
          <>
            <h2>Nueva compra o gasto</h2>
            <PurchaseForm initial={{ purchasedOn: today }} categories={categories} onDone={reload} onCancel={() => setCreating(false)} />
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + Registrar compra o gasto
          </button>
        )}
      </section>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Descripción</th>
              <th>Comprobante</th>
              <th className="num">Monto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="empty-row" colSpan={7}>
                  No hay compras registradas en este mes.
                </td>
              </tr>
            )}
            {rows.map(row =>
              editing === row.id ? (
                <tr key={row.id}>
                  <td colSpan={7} style={{ whiteSpace: 'normal' }}>
                    <PurchaseForm initial={row} categories={categories} onDone={reload} onCancel={() => setEditing(null)} />
                  </td>
                </tr>
              ) : (
                <tr key={row.id}>
                  <td>{row.purchasedOn.split('-').reverse().join('/')}</td>
                  <td>{categories[row.category]}</td>
                  <td>{row.supplier}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}>
                    {row.description}
                    {row.notes && <small className="muted"> · {row.notes}</small>}
                    {row.adminName && <small className="muted"> · {row.adminName}</small>}
                  </td>
                  <td>{row.documentNumber ?? '—'}</td>
                  <td className="num">{formatPEN(row.amountCents)}</td>
                  <td className="num">
                    <div className="actions" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn ghost small" onClick={() => setEditing(row.id)}>
                        Editar
                      </button>
                      {canDelete && (
                        <button type="button" className="btn ghost small" onClick={() => remove(row)}>
                          Borrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
