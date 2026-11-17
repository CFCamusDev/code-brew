import { useState, type FormEvent } from 'react';
import type { AdminLine } from '../../server/modules/catalog';
import { TEMPLATE_NAMES } from '../../lines/registry';
import type { LineInput } from '../../contracts/admin-lines';

const empty: LineInput = { name: '', slug: '', description: '', template: 'base', theme: {}, sortOrder: 0 };
const statuses = { draft: 'Borrador', active: 'Activa', archived: 'Archivada' };
export default function LinesManager({ initialLines, canEdit }: { initialLines: AdminLine[]; canEdit: boolean }) {
  const [lines, setLines] = useState(initialLines);
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [form, setForm] = useState<LineInput>(empty);
  const [theme, setTheme] = useState('{}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No se pudo completar la acción.');
    return result;
  }
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); setLines((await request('/api/admin/lines', 'GET')).lines); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo conectar.'); }
    finally { setBusy(false); }
  }
  function open(line?: AdminLine) {
    setEditing(line?.id ?? null); setForm(line ? { name: line.name, slug: line.slug, description: line.description, template: line.template as LineInput['template'], theme: line.theme, sortOrder: line.sortOrder } : { ...empty });
    setTheme(JSON.stringify(line?.theme ?? {}, null, 2)); setError(''); setNotice('');
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      let parsedTheme: unknown;
      try { parsedTheme = JSON.parse(theme); } catch { throw new Error('Revisa el formato JSON del tema.'); }
      await request(editing === null ? '/api/admin/lines' : `/api/admin/lines/${editing}`, editing === null ? 'POST' : 'PUT', { ...form, description: form.description || null, theme: parsedTheme });
      setEditing(undefined); setNotice('Línea guardada.');
    });
  }
  return <>
    {!canEdit && <p className="alert">Puedes consultar las líneas. Solo un administrador puede modificarlas.</p>}
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {canEdit && editing === undefined && <button className="btn" onClick={() => open()} disabled={busy}>Nueva línea</button>}
    {editing !== undefined && <form className="admin-card admin-form" onSubmit={save} style={{ marginTop: 20 }}>
      <h2>{editing === null ? 'Nueva línea' : 'Editar línea'}</h2>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 16 }}>
        <label>Nombre<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Slug<input required maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /><small>Identificador único: letras minúsculas, números y guiones.</small></label>
        <label>Descripción<textarea maxLength={2000} value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label>Plantilla<select value={form.template} onChange={e => setForm({ ...form, template: e.target.value as LineInput['template'] })}>{TEMPLATE_NAMES.map(name => <option key={name} value={name}>{name === 'base' ? 'Base' : 'Pipeline'}</option>)}</select></label>
        <label>Tema visual<textarea rows={5} value={theme} onChange={e => setTheme(e.target.value)} /><small>Variables CSS en JSON. Ejemplo: {'{"--cb-terracotta-bright":"#e58a5f"}'}. Usa {'{}'} para los colores predeterminados.</small></label>
        <label>Orden<input type="number" required min={0} max={2147483647} step={1} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} /><small>Los números menores aparecen primero.</small></label>
        <div><button className="btn" type="submit">{busy ? 'Guardando…' : 'Guardar línea'}</button> <button className="btn ghost" type="button" onClick={() => setEditing(undefined)}>Cancelar</button></div>
      </fieldset>
    </form>}
    <section className="admin-card" style={{ marginTop: 20 }}><div className="table-wrap"><table className="admin-table">
      <thead><tr><th>Orden</th><th>Línea</th><th>Estado</th><th>Plantilla</th>{canEdit && <th>Acciones</th>}</tr></thead>
      <tbody>{!lines.length && <tr><td colSpan={canEdit ? 5 : 4}>Aún no hay líneas.</td></tr>}{lines.map(line => <tr key={line.id}>
        <td>{line.sortOrder}</td><td>{line.name}<small className="muted" style={{ display: 'block' }}>{line.slug}</small></td><td>{statuses[line.status]}</td><td>{line.template}</td>
        {canEdit && <td><button className="btn ghost small" disabled={busy} onClick={() => open(line)}>Editar</button>{(['activate', 'archive'] as const).filter(action => action === 'activate' ? line.status !== 'active' : line.status !== 'archived').map(action => <button key={action} className="btn ghost small" disabled={busy} onClick={() => {
          if (action === 'archive' && !window.confirm(`¿Archivar ${line.name}? Dejará de verse en la tienda.`)) return;
          void perform(async () => { await request(`/api/admin/lines/${line.id}`, 'PATCH', { action }); setNotice(action === 'activate' ? 'Línea activada.' : 'Línea archivada.'); });
        }}>{action === 'activate' ? 'Activar' : 'Archivar'}</button>)}</td>}
      </tr>)}</tbody>
    </table></div></section>
  </>;
}
