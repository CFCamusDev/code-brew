import { useState } from 'react';
import { adminPost } from './request';

export default function ComplaintResponse({ id }: { id: number }) {
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await adminPost(`/api/admin/complaints/${id}`, { action: 'respond', response });
    if (result.error) {
      setError(result.error);
      setBusy(false);
    } else {
      window.location.reload();
    }
  };

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Respuesta
        <textarea rows={5} value={response} onChange={e => setResponse(e.target.value)} placeholder="Escribe la respuesta que recibirá el consumidor por correo." />
      </label>
      <div className="actions" style={{ alignItems: 'center' }}>
        <button type="submit" className="btn small" disabled={busy || response.trim().length === 0}>
          Registrar respuesta
        </button>
        {error && <span className="form-error">{error}</span>}
      </div>
    </form>
  );
}
