import { assertSubscription, normalizeWaitlistEmail } from '../domain/waitlist';
import type { WaitlistRepository } from './ports/waitlist-repository';

export async function subscribe(repository: WaitlistRepository, input: { email: string; productSlug: string; consent: boolean }): Promise<void> {
  const target = await repository.findTarget(input.productSlug);
  assertSubscription(target, input.consent);
  await repository.add(normalizeWaitlistEmail(input.email), target.id);
}
