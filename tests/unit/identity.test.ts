import { describe, expect, it } from 'vitest';
import { createIdentityService } from '../../src/server/modules/identity/application/identity-service';
import type { SessionRepository, StoredUser, UserRepository } from '../../src/server/modules/identity/application/ports';
import { LoginThrottle, SESSION_TTL_MS } from '../../src/server/modules/identity/domain/identity';
import { clientIp } from '../../src/server/modules/identity/http/client-ip';
import { FixedClock } from '../../src/server/shared/clock';

const ana: StoredUser = { id: 1, email: 'ana@codebrew.test', name: 'Ana', role: 'admin', active: true, passwordHash: 'hash:secreto' };

function harness(users: StoredUser[] = [ana]) {
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const sessions = new Map<string, { userId: number; expiresAt: Date }>();
  const logins: number[] = [];
  const hashes = new Map(users.map(u => [u.id, u.passwordHash]));
  const sessionRepo: SessionRepository = {
    async insert(s) { sessions.set(s.id, s); },
    async deleteExpired(now) { for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id); },
    async findActiveUser(id, now) {
      const s = sessions.get(id);
      const user = users.find(u => u.id === s?.userId);
      return s && s.expiresAt > now && user?.active ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
    },
    async delete(id) { sessions.delete(id); },
    async deleteAllOf(userId) { for (const [id, s] of sessions) if (s.userId === userId) sessions.delete(id); }
  };
  const userRepo: UserRepository = {
    async findByEmail(email) { return users.find(u => u.email === email) ?? null; },
    async touchLastLogin(id) { logins.push(id); },
    async findPasswordHash(id) { return hashes.get(id) ?? null; },
    async updatePasswordHash(id, hash) { hashes.set(id, hash); }
  };
  let counter = 0;
  const service = createIdentityService({
    sessions: sessionRepo,
    users: userRepo,
    hasher: { hash: async p => `hash:${p}`, verify: async (p, stored) => stored === `hash:${p}` },
    tokens: { generate: () => `token${++counter}`, digest: v => `sha(${v})` },
    clock,
    throttle: new LoginThrottle(clock)
  });
  return { service, clock, sessions, logins, hashes };
}

describe('LoginThrottle', () => {
  it('bloquea tras 5 fallos dentro de la ventana y se libera al vencer', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const throttle = new LoginThrottle(clock);
    for (let i = 0; i < 4; i++) throttle.recordFailure('ip:1');
    expect(throttle.isLocked('ip:1')).toBe(false);
    throttle.recordFailure('ip:1');
    expect(throttle.isLocked('ip:1')).toBe(true);
    clock.advance(15 * 60 * 1000 + 1);
    expect(throttle.isLocked('ip:1')).toBe(false);
  });

  it('reset limpia los fallos', () => {
    const throttle = new LoginThrottle(new FixedClock(new Date()));
    for (let i = 0; i < 5; i++) throttle.recordFailure('k');
    throttle.reset('k');
    expect(throttle.isLocked('k')).toBe(false);
  });
});

describe('sesiones', () => {
  it('guarda solo el hash del token y la sesión vence a los 7 días', async () => {
    const { service, clock, sessions } = harness();
    const { token, expiresAt } = await service.createSession(1, 'agente');
    expect([...sessions.keys()]).toEqual([`sha(${token})`]);
    expect(expiresAt.getTime() - clock.now().getTime()).toBe(SESSION_TTL_MS);
    expect(await service.getSessionUser(token)).toMatchObject({ id: 1, role: 'admin' });
    clock.advance(SESSION_TTL_MS + 1);
    expect(await service.getSessionUser(token)).toBeNull();
  });

  it('cerrar sesión o cerrar todas las del usuario las invalida', async () => {
    const { service } = harness();
    const a = await service.createSession(1, null);
    const b = await service.createSession(1, null);
    await service.deleteSession(a.token);
    expect(await service.getSessionUser(a.token)).toBeNull();
    await service.deleteUserSessions(1);
    expect(await service.getSessionUser(b.token)).toBeNull();
  });

  it('un usuario desactivado pierde el acceso aunque su sesión siga vigente', async () => {
    const inactive = { ...ana, active: false };
    const { service } = harness([inactive]);
    const { token } = await service.createSession(1, null);
    expect(await service.getSessionUser(token)).toBeNull();
  });
});

describe('login', () => {
  it('acepta credenciales válidas y registra el último ingreso', async () => {
    const { service, logins } = harness();
    expect(await service.login('ana@codebrew.test', 'secreto', '1.1.1.1')).toEqual({
      ok: true, user: { id: 1, email: 'ana@codebrew.test', name: 'Ana', role: 'admin' }
    });
    expect(logins).toEqual([1]);
  });

  it('rechaza contraseña errónea, correo inexistente o usuario inactivo con el mismo motivo', async () => {
    const { service } = harness([ana, { ...ana, id: 2, email: 'off@codebrew.test', active: false }]);
    expect(await service.login('ana@codebrew.test', 'mala', '1.1.1.1')).toEqual({ ok: false, reason: 'invalid' });
    expect(await service.login('nadie@codebrew.test', 'secreto', '1.1.1.1')).toEqual({ ok: false, reason: 'invalid' });
    expect(await service.login('off@codebrew.test', 'secreto', '1.1.1.1')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('tras 5 intentos fallidos bloquea la IP, incluso con la contraseña correcta', async () => {
    const { service } = harness();
    for (let i = 0; i < 5; i++) await service.login('ana@codebrew.test', 'mala', '9.9.9.9');
    expect(await service.login('ana@codebrew.test', 'secreto', '9.9.9.9')).toEqual({ ok: false, reason: 'locked' });
  });

  it('un acierto limpia los fallos previos', async () => {
    const { service } = harness();
    for (let i = 0; i < 4; i++) await service.login('ana@codebrew.test', 'mala', '2.2.2.2');
    expect((await service.login('ana@codebrew.test', 'secreto', '2.2.2.2')).ok).toBe(true);
    for (let i = 0; i < 4; i++) await service.login('ana@codebrew.test', 'mala', '2.2.2.2');
    expect((await service.login('ana@codebrew.test', 'secreto', '2.2.2.2')).ok).toBe(true);
  });
});

describe('cambio de contraseña', () => {
  it('exige la contraseña actual', async () => {
    const { service, hashes } = harness();
    expect(await service.changePassword(1, 'mala', 'nueva')).toBe(false);
    expect(hashes.get(1)).toBe('hash:secreto');
    expect(await service.changePassword(1, 'secreto', 'nueva')).toBe(true);
    expect(hashes.get(1)).toBe('hash:nueva');
    expect(await service.changePassword(99, 'x', 'y')).toBe(false);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://x', { headers });
  it('prioriza Cloudflare, luego nginx y luego x-forwarded-for', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }), 'f')).toBe('1.1.1.1');
    expect(clientIp(req({ 'x-real-ip': '2.2.2.2' }), 'f')).toBe('2.2.2.2');
    expect(clientIp(req({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }), 'f')).toBe('3.3.3.3');
    expect(clientIp(req({}), 'fallback')).toBe('fallback');
  });
});
