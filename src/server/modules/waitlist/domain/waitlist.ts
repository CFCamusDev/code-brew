import { NotFoundError, ValidationError } from '../../../shared/errors';
import type { Clock } from '../../../shared/clock';

export interface WaitlistTarget { id: number; status: string | null; lineStatus: string | null }
export function assertSubscription(target: WaitlistTarget | null, consent: boolean): asserts target is WaitlistTarget {
  if (!consent) throw new ValidationError('Debes aceptar recibir el aviso de este producto.', 'consent_required');
  if (!target || target.status !== 'upcoming' || target.lineStatus !== 'active') throw new NotFoundError('Producto no disponible para avisos.');
}
export const normalizeWaitlistEmail = (email: string) => email.trim().toLowerCase();

export const WAITLIST_WINDOW_MS = 15 * 60 * 1000;
/** Política por IP, sin guardar correos ni permitir crecimiento ilimitado de memoria. */
export class WaitlistThrottle {
  private entries = new Map<string, { used: number; until: number }>();
  constructor(private clock: Clock, private limit = 20, private windowMs = WAITLIST_WINDOW_MS, private capacity = 5000) {}
  take(key: string): boolean {
    const now = this.clock.now().getTime();
    const entry = this.entries.get(key);
    if (entry && entry.until > now) {
      if (entry.used >= this.limit) return false;
      entry.used++;
      return true;
    }
    this.entries.delete(key);
    if (this.entries.size >= this.capacity) {
      for (const [storedKey, stored] of this.entries) if (stored.until <= now) this.entries.delete(storedKey);
      if (this.entries.size >= this.capacity) return false;
    }
    this.entries.set(key, { used: 1, until: now + this.windowMs });
    return true;
  }
}
