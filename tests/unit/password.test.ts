import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../scripts/lib/password.mjs';

describe('contraseñas', () => {
  it('verifica la contraseña correcta y rechaza otras', async () => {
    const hash = await hashPassword('una-clave-segura');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('una-clave-segura', hash)).toBe(true);
    expect(await verifyPassword('otra-clave', hash)).toBe(false);
  });

  it('usa una sal distinta en cada hash', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('rechaza formatos desconocidos', async () => {
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});
