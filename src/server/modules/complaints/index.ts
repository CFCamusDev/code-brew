import { systemClock } from '../../shared/clock';
import { unitOfWork } from '../../shared/unit-of-work';
import { sendComplaintEmails } from '../../../lib/server/email';
import { registerComplaint, type ComplaintNotifier } from './application/register-complaint';
import type { ComplaintInput, ComplaintRecord } from './domain/complaint';
import { createDrizzleComplaintRepository } from './infrastructure/drizzle-complaint-repository';

// API pública del módulo complaints (Libro de Reclamaciones virtual, CB-202). Raíz de composición.

export type { ComplaintInput, ComplaintRecord, ComplaintType } from './domain/complaint';

const notifier: ComplaintNotifier = { notifyRegistered: sendComplaintEmails };

/** Registra un reclamo o queja con numeración correlativa por año y envía los correos. */
export function createComplaint(data: ComplaintInput): Promise<ComplaintRecord> {
  return registerComplaint(
    { clock: systemClock, notifier, persist: work => unitOfWork.run(tx => work(createDrizzleComplaintRepository(tx))) },
    data
  );
}
