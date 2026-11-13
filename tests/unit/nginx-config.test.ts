import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const conf = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');

describe('nginx.conf: límite de peticiones', () => {
  it('define una zona por tipo de endpoint sensible', () => {
    for (const zone of ['login', 'orders', 'lookup', 'payments', 'contact']) {
      expect(conf, `zona ${zone}`).toMatch(new RegExp(String.raw`limit_req_zone \$key_${zone}\s+zone=${zone}:`));
      expect(conf, `límite aplicado ${zone}`).toMatch(new RegExp(String.raw`limit_req zone=${zone}\s+burst=`));
    }
  });

  it('responde 429, también en JSON como la app', () => {
    expect(conf).toContain('limit_req_status 429;');
    expect(conf).toContain('error_page 429 @rate_limited;');
    expect(conf).toContain('Retry-After');
  });

  it('limita las rutas sensibles y no el sondeo de estado ni las páginas', () => {
    for (const route of ['POST /api/admin/login', 'POST /api/orders"', 'POST /api/orders/lookup', 'POST /api/payments/charge', 'POST /api/complaints', 'GET /api/contact/whatsapp']) {
      expect(conf, route).toContain(route);
    }
    expect(conf).not.toMatch(/GET \/api\/orders/);
  });

  it('la clave es la IP real del cliente: CF-Connecting-IP o, si falta, la del socket', () => {
    expect(conf).toMatch(/map \$http_cf_connecting_ip \$limit_ip \{[^}]*''\s+\$remote_addr;/s);
  });
});
