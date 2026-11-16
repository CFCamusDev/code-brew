import type { Clock } from '../../../shared/clock';

export const SESSION_COOKIE = 'cb_admin';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AdminRole = 'admin' | 'operator';

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: AdminRole;
}

export type LoginResult = { ok: true; user: AdminUser } | { ok: false; reason: 'invalid' | 'locked' };

/**
 * Límite de intentos fallidos de login: tras `maxFailures` dentro de la ventana, la clave (IP o correo) queda
 * bloqueada hasta que la ventana vence. En memoria: se reinicia con el proceso.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; first: number }>();

  constructor(
    private readonly clock: Clock,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxFailures = 5
  ) {}

  isLocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (this.clock.now().getTime() - entry.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const now = this.clock.now().getTime();
    const entry = this.failures.get(key);
    if (!entry || now - entry.first > this.windowMs) this.failures.set(key, { count: 1, first: now });
    else entry.count++;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
