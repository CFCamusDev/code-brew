import type { WaitlistTarget } from '../../domain/waitlist';

export interface WaitlistRepository {
  findTarget(slug: string): Promise<WaitlistTarget | null>;
  /** Alta idempotente: un duplicado no cambia sus fechas ni su consentimiento. */
  add(email: string, productId: number): Promise<void>;
}
