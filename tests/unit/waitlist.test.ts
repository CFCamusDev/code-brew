import { describe, expect, it } from 'vitest';
import { waitlistInput } from '../../src/contracts/waitlist';
import { FixedClock } from '../../src/server/shared/clock';
import { assertSubscription, WaitlistThrottle } from '../../src/server/modules/waitlist/domain/waitlist';
import { subscribe } from '../../src/server/modules/waitlist/application/subscribe';

const valid = { email: 'Persona@Example.com', productSlug: 'coldstart', consent: true };
describe('contrato de interesados', () => {
  it('normaliza el correo y exige consentimiento explícito', () => {
    expect(waitlistInput.parse({ ...valid, email: '  Persona@Example.com  ' }).email).toBe('persona@example.com');
  });
  it.each([{ consent: false }, { consent: 'true' }, { consent: undefined }, { email: 'incorrecto' }, { email: 'a'.repeat(255) }, { productSlug: '../secreto' }, { productId: 1 }])('rechaza entradas inválidas: %j', change => {
    expect(waitlistInput.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});
describe('política de suscripción', () => {
  it.each([null, { id: 1, status: 'draft', lineStatus: 'active' }, { id: 1, status: 'active', lineStatus: 'active' }, { id: 1, status: 'discontinued', lineStatus: 'active' }, { id: 1, status: 'upcoming', lineStatus: 'archived' }, { id: 1, status: 'upcoming', lineStatus: 'draft' }])('no suscribe productos que no admiten avisos: %j', target => {
    expect(() => assertSubscription(target, true)).toThrow('Producto no disponible');
  });
  it('defiende el consentimiento también fuera del transporte HTTP', () => {
    expect(() => assertSubscription({ id: 1, status: 'upcoming', lineStatus: 'active' }, false)).toThrow('Debes aceptar');
  });
  it('entrega al repositorio únicamente correo normalizado e id del producto', async () => {
    const saved: unknown[] = [];
    await subscribe({ findTarget: async () => ({ id: 7, status: 'upcoming', lineStatus: 'active' }), add: async (email, id) => { saved.push({ email, id }); } }, { ...valid, email: ' Persona@Example.com ' });
    expect(saved).toEqual([{ email: 'persona@example.com', id: 7 }]);
  });
});
describe('límite de intentos', () => {
  it('cuenta éxitos o errores antes de cualquier espera y permite volver al vencer la ventana', () => {
    const clock = new FixedClock(new Date('2026-11-17T12:00:00Z'));
    const throttle = new WaitlistThrottle(clock, 2, 1000);
    expect(throttle.take('ip-a')).toBe(true);
    expect(throttle.take('ip-a')).toBe(true);
    expect(throttle.take('ip-a')).toBe(false);
    expect(throttle.take('ip-b')).toBe(true);
    clock.advance(1000);
    expect(throttle.take('ip-a')).toBe(true);
  });
  it('limita la memoria y recupera capacidad al vencer las entradas', () => {
    const clock = new FixedClock(new Date('2026-11-17T12:00:00Z'));
    const throttle = new WaitlistThrottle(clock, 2, 1000, 1);
    expect(throttle.take('ip-a')).toBe(true);
    expect(throttle.take('ip-b')).toBe(false);
    clock.advance(1000);
    expect(throttle.take('ip-b')).toBe(true);
  });
});
