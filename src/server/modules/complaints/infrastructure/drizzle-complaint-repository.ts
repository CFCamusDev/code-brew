import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../shared/unit-of-work';
import { complaintCounters, complaints } from '../../../../lib/server/db/schema';
import type { ComplaintRepository } from '../application/register-complaint';

export function createDrizzleComplaintRepository(tx: Transaction): ComplaintRepository {
  return {
    async nextSequence(year) {
      const [counter] = await tx
        .insert(complaintCounters)
        .values({ year, lastNumber: 1 })
        .onConflictDoUpdate({ target: complaintCounters.year, set: { lastNumber: sql`${complaintCounters.lastNumber} + 1` } })
        .returning({ lastNumber: complaintCounters.lastNumber });
      return counter.lastNumber;
    },
    async insert(data) {
      const [row] = await tx
        .insert(complaints)
        .values({
          year: data.year,
          sequence: data.sequence,
          type: data.type,
          consumerName: data.consumerName,
          consumerDocument: data.consumerDocument || null,
          consumerEmail: data.consumerEmail,
          consumerPhone: data.consumerPhone || null,
          consumerAddress: data.consumerAddress,
          isMinor: data.isMinor,
          guardianName: data.guardianName || null,
          guardianDocument: data.guardianDocument || null,
          productOrService: data.productOrService,
          amountCents: data.amountCents,
          detail: data.detail,
          consumerRequest: data.consumerRequest
        })
        .returning();
      return row;
    }
  };
}
