import { describe, expect, it } from 'vitest';
import { whatsAppContextForPath, whatsAppMessage } from '../../src/lib/whatsapp';

describe('acceso flotante a WhatsApp', () => {
  it('usa un mensaje general para las páginas públicas', () => {
    for (const path of ['/', '/politicas/privacidad', '/reclamos']) {
      expect(whatsAppContextForPath(path)).toBe('general');
    }
    expect(whatsAppMessage('general')).toContain('sus cafés o envíos');
  });

  it('adapta el contexto del checkout y seguimiento', () => {
    expect(whatsAppContextForPath('/checkout')).toBe('checkout');
    expect(whatsAppContextForPath('/checkout/')).toBe('checkout');
    expect(whatsAppMessage('checkout')).toContain('completando mi pedido');
    expect(whatsAppContextForPath('/pedido')).toBe('order');
    expect(whatsAppContextForPath('/pedido/private-token')).toBe('order');
    expect(whatsAppMessage('order')).toContain('seguimiento');
  });

  it('no incluye datos privados ni acepta mensajes arbitrarios', () => {
    const context = whatsAppContextForPath('/pedido/private-token');
    expect(whatsAppMessage(context)).not.toContain('private-token');
    expect(whatsAppMessage('https://example.com')).toBe(whatsAppMessage(null));
    expect(whatsAppContextForPath('/checkout-unrelated')).toBe('general');
  });
});
