import { describe, expect, it } from 'vitest';
import { ADMIN, api, db, login } from './helpers';
import { whatsAppMessage } from '../../src/lib/whatsapp';

describe('WhatsApp flotante', () => {
  it('está en las páginas públicas con el contexto correcto y no en el panel', async () => {
    for (const [path, context] of [
      ['/', 'general'],
      ['/checkout', 'checkout'],
      ['/pedido', 'order'],
      ['/politicas/privacidad', 'general'],
      ['/reclamos', 'general']
    ]) {
      const page = await api(path);
      expect(page.status, path).toBe(200);
      const link = page.text.match(/<a\b[^>]*data-floating-whatsapp[^>]*>/)?.[0];
      expect(link, path).toContain(`/api/contact/whatsapp?context=${context}`);
      expect(link, path).toContain('aria-label="Escribir a CodeBrew por WhatsApp');
      expect(link, path).toContain('target="_blank"');
    }
    expect((await api('/admin/login')).text).not.toContain('data-floating-whatsapp');
  });

  it('redirige a WhatsApp con mensajes seguros y sin seguir enlaces externos', async () => {
    for (const context of ['general', 'checkout', 'order', 'https://example.com']) {
      const response = await api(`/api/contact/whatsapp?context=${encodeURIComponent(context)}`);
      expect(response.status).toBe(302);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const destination = new URL(response.headers.get('location')!);
      expect(destination.origin).toBe('https://wa.me');
      expect(destination.pathname).toMatch(/^\/\d+$/);
      expect(destination.searchParams.get('text')).toBe(whatsAppMessage(context));
    }
  });

  it('usa el número guardado en el panel incluso desde páginas prerenderizadas', async () => {
    const cookie = await login(ADMIN);
    const sql = db();
    try {
      const [row] = await sql`select value from site_settings where key = 'social_links'`;
      const original = row?.value ?? { instagram: '', tiktok: '', facebook: '', whatsapp: '' };
      try {
        const saved = await api('/api/admin/settings', {
          cookie,
          body: { action: 'social-links', ...original, whatsapp: '987654321' }
        });
        expect(saved.status).toBe(200);
        const response = await api('/api/contact/whatsapp?context=checkout');
        expect(new URL(response.headers.get('location')!).pathname).toBe('/51987654321');
      } finally {
        const restored = await api('/api/admin/settings', { cookie, body: { action: 'social-links', ...original } });
        expect(restored.status).toBe(200);
      }
    } finally {
      await sql.end();
    }
  });
});
