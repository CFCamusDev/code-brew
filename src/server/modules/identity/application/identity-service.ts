import type { Clock } from '../../../shared/clock';
import { LoginThrottle, SESSION_TTL_MS, type AdminUser, type LoginResult } from '../domain/identity';
import type { PasswordHasher, SessionRepository, TokenService, UserRepository } from './ports';

export interface IdentityDeps {
  sessions: SessionRepository;
  users: UserRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  clock: Clock;
  throttle: LoginThrottle;
}

/** Casos de uso de identidad del panel de administración: sesiones, login con límite de intentos y contraseña. */
export function createIdentityService(deps: IdentityDeps) {
  const { sessions, users, hasher, tokens, clock, throttle } = deps;
  // Hash de relleno para que un correo inexistente tarde lo mismo que uno real.
  let dummyHash: Promise<string> | undefined;

  return {
    async createSession(userId: number, userAgent: string | null) {
      const token = tokens.generate();
      const expiresAt = new Date(clock.now().getTime() + SESSION_TTL_MS);
      await sessions.insert({ id: tokens.digest(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
      // Limpieza oportunista de sesiones vencidas.
      await sessions.deleteExpired(clock.now());
      return { token, expiresAt };
    },

    getSessionUser(token: string): Promise<AdminUser | null> {
      return sessions.findActiveUser(tokens.digest(token), clock.now());
    },

    deleteSession(token: string) {
      return sessions.delete(tokens.digest(token));
    },

    deleteUserSessions(userId: number) {
      return sessions.deleteAllOf(userId);
    },

    async login(email: string, password: string, ip: string): Promise<LoginResult> {
      const keys = [`ip:${ip}`, `email:${email}`];
      if (keys.some(key => throttle.isLocked(key))) return { ok: false, reason: 'locked' };

      const user = await users.findByEmail(email);
      dummyHash ??= hasher.hash(tokens.generate());
      const valid = await hasher.verify(password, user?.passwordHash ?? (await dummyHash));

      if (!user || !user.active || !valid) {
        keys.forEach(key => throttle.recordFailure(key));
        return { ok: false, reason: 'invalid' };
      }
      keys.forEach(key => throttle.reset(key));
      await users.touchLastLogin(user.id, clock.now());
      return { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    },

    async changePassword(userId: number, current: string, next: string) {
      const stored = await users.findPasswordHash(userId);
      if (!stored || !(await hasher.verify(current, stored))) return false;
      await users.updatePasswordHash(userId, await hasher.hash(next));
      return true;
    }
  };
}
