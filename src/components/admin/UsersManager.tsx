import { useState } from 'react';
import { adminPost } from './request';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  active: boolean;
  /** Ya formateado en el servidor: formatear en la isla daba textos distintos al hidratar (parpadeo). */
  lastLogin: string | null;
}

const ROLE = { admin: 'Administrador', operator: 'Operador' } as const;

function TemporaryPassword({ email, password }: { email: string; password: string }) {
  return (
    <div className="alert" role="status" style={{ background: 'var(--glass-strong)' }}>
      Contraseña temporal para <strong>{email}</strong>: <code style={{ fontSize: 15 }}>{password}</code>
      <br />
      <small>Cópiala ahora: no se volverá a mostrar. Pídele que la cambie en «Mi cuenta» al entrar.</small>
    </div>
  );
}

function UserRow({ user, isSelf, onPassword }: { user: User; isSelf: boolean; onPassword: (email: string, password: string) => void }) {
  const [form, setForm] = useState({ name: user.name, role: user.role, active: user.active });
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const changed = form.name !== user.name || form.role !== user.role || form.active !== user.active;

  const save = async () => {
    setBusy(true);
    const result = await adminPost('/api/admin/users', { action: 'update', id: user.id, ...form });
    setBusy(false);
    setMessage(result.error ? { error: result.error } : { ok: 'Guardado.' });
  };

  const reset = async () => {
    if (!window.confirm(`¿Generar una nueva contraseña para ${user.email}? Se cerrarán sus sesiones.`)) return;
    setBusy(true);
    const result = await adminPost<{ password: string }>('/api/admin/users', { action: 'reset', id: user.id });
    setBusy(false);
    if (result.error) setMessage({ error: result.error });
    else onPassword(user.email, result.password);
  };

  return (
    <tr>
      <td>
        <input className="admin-input" value={form.name} maxLength={80} aria-label="Nombre" onChange={e => setForm({ ...form, name: e.target.value })} />
        <br />
        <small className="muted">
          {user.email}
          {isSelf && ' · tú'}
        </small>
      </td>
      <td>
        <select
          className="admin-input"
          value={form.role}
          aria-label="Rol"
          disabled={isSelf}
          onChange={e => setForm({ ...form, role: e.target.value as User['role'] })}
        >
          <option value="admin">{ROLE.admin}</option>
          <option value="operator">{ROLE.operator}</option>
        </select>
      </td>
      <td>
        <label className="check">
          <input type="checkbox" checked={form.active} disabled={isSelf} onChange={e => setForm({ ...form, active: e.target.checked })} /> Activo
        </label>
      </td>
      <td>{user.lastLogin ?? 'Nunca'}</td>
      <td>
        <div className="actions" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          <button type="button" className="btn small" onClick={save} disabled={busy || !changed}>
            Guardar
          </button>
          {!isSelf && (
            <button type="button" className="btn ghost small" onClick={reset} disabled={busy}>
              Nueva contraseña
            </button>
          )}
          {message.error && <span className="form-error">{message.error}</span>}
          {message.ok && <span className="form-ok">{message.ok}</span>}
        </div>
      </td>
    </tr>
  );
}

export default function UsersManager({ users, selfId }: { users: User[]; selfId: number }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const result = await adminPost<{ password: string }>('/api/admin/users', { action: 'create', ...data });
    if (result.error) return setError(result.error);
    setRevealed({ email: String(data.email).toLowerCase(), password: result.password });
    setCreating(false);
    setError(null);
  };

  return (
    <div className="admin-stack">
      {revealed && (
        <div>
          <TemporaryPassword {...revealed} />
          <button type="button" className="btn ghost small" onClick={() => window.location.reload()}>
            Listo, ya la copié
          </button>
        </div>
      )}
      <section className="admin-card">
        {creating ? (
          <form className="admin-form" onSubmit={create}>
            <h2>Nuevo usuario</h2>
            <div className="row">
              <label>
                Nombre
                <input name="name" maxLength={80} required />
              </label>
              <label>
                Correo
                <input name="email" type="email" maxLength={160} required />
              </label>
            </div>
            <label>
              Rol
              <select name="role" defaultValue="operator">
                <option value="operator">Operador: pedidos, stock y compras</option>
                <option value="admin">Administrador: todo, incluidos precios, reembolsos y usuarios</option>
              </select>
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="actions">
              <button className="btn" type="submit">
                Crear usuario
              </button>
              <button className="btn ghost" type="button" onClick={() => setCreating(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            + Nuevo usuario
          </button>
        )}
      </section>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <UserRow key={user.id} user={user} isSelf={user.id === selfId} onPassword={(email, password) => setRevealed({ email, password })} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
