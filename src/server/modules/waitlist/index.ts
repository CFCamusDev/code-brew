import { unitOfWork } from '../../shared/unit-of-work';
import { subscribe } from './application/subscribe';
import { createWaitlistRepository } from './infrastructure/drizzle-waitlist-repository';
import type { WaitlistInput } from '../../../contracts/waitlist';

export const subscribeToWaitlist = (input: WaitlistInput) => unitOfWork.run(tx => subscribe(createWaitlistRepository(tx), input));
