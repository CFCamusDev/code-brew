import { useState } from 'react';
import { formatDateTime } from '../../lib/shop/format';
import { adminPost } from './request';

interface SocialLinksForm {
  instagram: string;
  tiktok: string;
  facebook: string;
  whatsapp: string;
}

interface PolicyForm {
  title: string;
  body: string;
  updatedAt: string | null;
}

const POLICY_LABELS: Record<string, string> = {
  terminos: 'Términos y condiciones',
  privacidad: 'Política de privacidad',
  'envios-devoluciones': 'Envíos y devoluciones'
};

function SocialLinksSection({ initial }: { initial: SocialLinksForm }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage({});
    const result = await adminPost('/api/admin/settings', { action: 'social-links', ...form });
    setBusy(false);
    setMessage(result.error ? { error: result.error } : { ok: 'Guardado. Ya se ve en la web.' });
  };

  return (
    <section className="admin-card">
      <h2>Redes sociales y WhatsApp</h2>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Deja un campo vacío para que ese ícono no se muestre en el pie de página.
      </p>
      <div className="admin-form">
        <div className="row">
          <label>
            Instagram (link completo)
            <input value={form.instagram} placeholder="https://www.instagram.com/tu-usuario" onChange={e => setForm({ ...form, instagram: e.target.value })} />
          </label>
          <label>
            TikTok (link completo)
            <input value={form.tiktok} placeholder="https://www.tiktok.com/@tu-usuario" onChange={e => setForm({ ...form, tiktok: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label>
            Facebook (link completo)
            <input value={form.facebook} placeholder="https://facebook.com/tu-pagina" onChange={e => setForm({ ...form, facebook: e.target.value })} />
          </label>
          <label>
            WhatsApp (celular, 9 dígitos)
            <input value={form.whatsapp} placeholder="987654321" maxLength={9} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
          </label>
        </div>
        <div className="actions">
          <button type="button" className="btn small" onClick={save} disabled={busy}>
            Guardar
          </button>
        </div>
      </div>
      {(message.error || message.ok) && (
        <p className={message.error ? 'form-error' : 'form-ok'} style={{ marginTop: 10 }}>
          {message.error ?? message.ok}
        </p>
      )}
    </section>
  );
}

function PolicyCard({ slug, initial }: { slug: string; initial: PolicyForm }) {
  const [form, setForm] = useState({ title: initial.title, body: initial.body });
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage({});
    const result = await adminPost('/api/admin/settings', { action: 'policy', slug, ...form });
    setBusy(false);
    setMessage(result.error ? { error: result.error } : { ok: 'Guardado. Ya se ve en /politicas/' + slug + '.' });
  };

  return (
    <section className="admin-card">
      <h2>{POLICY_LABELS[slug] ?? slug}</h2>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        {initial.updatedAt ? `Última actualización: ${formatDateTime(initial.updatedAt)}` : 'Aún no se ha publicado.'}
      </p>
      <div className="admin-form">
        <label>
          Título (se muestra en la página pública)
          <input value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Texto (deja una línea en blanco entre párrafos)
          <textarea rows={10} value={form.body} maxLength={20000} onChange={e => setForm({ ...form, body: e.target.value })} />
        </label>
        <div className="actions">
          <button type="button" className="btn small" onClick={save} disabled={busy}>
            Guardar
          </button>
          <a className="btn ghost small" href={`/politicas/${slug}`} target="_blank" rel="noopener noreferrer">
            Ver página pública ↗
          </a>
        </div>
      </div>
      {(message.error || message.ok) && (
        <p className={message.error ? 'form-error' : 'form-ok'} style={{ marginTop: 10 }}>
          {message.error ?? message.ok}
        </p>
      )}
    </section>
  );
}

export default function SettingsManager({
  socialLinks,
  policies
}: {
  socialLinks: SocialLinksForm;
  policies: Record<string, PolicyForm>;
}) {
  return (
    <div className="admin-stack">
      <SocialLinksSection initial={socialLinks} />
      {Object.entries(policies).map(([slug, policy]) => (
        <PolicyCard key={slug} slug={slug} initial={policy} />
      ))}
    </div>
  );
}
