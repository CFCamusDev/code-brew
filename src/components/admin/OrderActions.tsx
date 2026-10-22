import { useState } from 'react';

type Status = 'pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

const ACTION_LABEL: Partial<Record<Status, string>> = {
  preparing: 'Marcar en preparación',
  shipped: 'Marcar como enviado',
  delivered: 'Marcar como entregado',
  cancelled: 'Cancelar pedido'
};

interface Props {
  orderId: string;
  transitions: Status[];
  canRefund: boolean;
  autoRefund: boolean;
  adminNotes: string;
}

async function send(orderId: string, body: unknown) {
  const response = await fetch(`/api/admin/orders/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (response.ok) return null;
  if (response.status === 401) {
    window.location.assign(`/admin/login?next=${encodeURIComponent(location.pathname)}`);
    return null;
  }
  return (await response.json().catch(() => ({}))).error ?? 'No se pudo completar la acción.';
}

export default function OrderActions({ orderId, transitions, canRefund, autoRefund, adminNotes }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [notes, setNotes] = useState(adminNotes);
  const [notesSaved, setNotesSaved] = useState(false);

  const run = async (body: unknown, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const message = await send(orderId, body);
    if (message) {
      setError(message);
      setBusy(false);
    } else {
      window.location.reload();
    }
  };

  const onShip = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    run({ action: 'status', to: 'shipped', carrier: data.carrier, trackingNumber: data.trackingNumber, note: data.note });
  };

  const onRefund = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const manual = !autoRefund || data.get('manual') === 'on';
    run(
      { action: 'refund', reason: data.get('reason'), restock: data.get('restock') === 'on', manual, note: data.get('note') || undefined },
      manual
        ? '¿Registrar el pedido como reembolsado? La devolución del dinero la haces tú desde CulqiPanel.'
        : '¿Devolver el pago completo al cliente a través de Culqi? Esta acción no se puede deshacer.'
    );
  };

  const saveNotes = async () => {
    setBusy(true);
    setError(null);
    const message = await send(orderId, { action: 'notes', notes });
    setBusy(false);
    if (message) setError(message);
    else setNotesSaved(true);
  };

  return (
    <div className="admin-stack">
      {(transitions.length > 0 || canRefund) && (
        <section className="admin-card">
          <h2>Acciones</h2>
          <div className="actions">
            {transitions
              .filter(to => to !== 'shipped')
              .map(to => (
                <button
                  key={to}
                  type="button"
                  className={to === 'cancelled' ? 'btn ghost' : 'btn'}
                  disabled={busy}
                  onClick={() => run({ action: 'status', to }, to === 'cancelled' ? '¿Cancelar este pedido sin pagar?' : undefined)}
                >
                  {ACTION_LABEL[to]}
                </button>
              ))}
            {transitions.includes('shipped') && !shipping && (
              <button type="button" className="btn" disabled={busy} onClick={() => setShipping(true)}>
                {ACTION_LABEL.shipped}
              </button>
            )}
            {canRefund && !refunding && (
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setRefunding(true)}>
                Reembolsar
              </button>
            )}
          </div>

          {shipping && (
            <form className="admin-form" onSubmit={onShip} style={{ marginTop: 16 }}>
              <div className="row">
                <label>
                  Transportista
                  <input name="carrier" placeholder="Olva, Shalom, motorizado…" maxLength={80} />
                </label>
                <label>
                  N.º de seguimiento
                  <input name="trackingNumber" maxLength={120} />
                </label>
              </div>
              <label>
                Nota interna (opcional)
                <input name="note" maxLength={500} />
              </label>
              <p className="muted">Se enviará un correo al cliente avisando que su pedido salió.</p>
              <div className="actions">
                <button className="btn" type="submit" disabled={busy}>
                  Confirmar envío
                </button>
                <button className="btn ghost" type="button" onClick={() => setShipping(false)}>
                  Volver
                </button>
              </div>
            </form>
          )}

          {refunding && (
            <form className="admin-form" onSubmit={onRefund} style={{ marginTop: 16 }}>
              <label>
                Motivo
                <select name="reason" defaultValue="solicitud_comprador">
                  <option value="solicitud_comprador">Solicitud del cliente</option>
                  <option value="duplicado">Pago duplicado</option>
                  <option value="fraudulento">Fraudulento</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" name="restock" defaultChecked /> Devolver los productos al stock
              </label>
              {autoRefund ? (
                <label className="check">
                  <input type="checkbox" name="manual" /> Ya lo devolví desde CulqiPanel (solo registrar)
                </label>
              ) : (
                <p className="muted">Este pago fue en efectivo o billetera: devuélvelo desde CulqiPanel y aquí solo se registra.</p>
              )}
              <label>
                Nota (opcional)
                <input name="note" maxLength={500} />
              </label>
              <div className="actions">
                <button className="btn danger" type="submit" disabled={busy}>
                  Confirmar reembolso
                </button>
                <button className="btn ghost" type="button" onClick={() => setRefunding(false)}>
                  Volver
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
        </section>
      )}

      <section className="admin-card admin-form">
        <h2>Notas internas</h2>
        <textarea
          value={notes}
          onChange={event => {
            setNotes(event.target.value);
            setNotesSaved(false);
          }}
          maxLength={2000}
          aria-label="Notas internas"
          placeholder="Solo las ve el equipo."
        />
        <div className="actions">
          <button type="button" className="btn ghost small" onClick={saveNotes} disabled={busy || notes === adminNotes}>
            Guardar notas
          </button>
          {notesSaved && <p className="form-ok">Guardado.</p>}
        </div>
        {error && !transitions.length && !canRefund && <p className="form-error">{error}</p>}
      </section>
    </div>
  );
}
