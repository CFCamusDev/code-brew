import { sql } from 'drizzle-orm';
import type { Complaint } from '../shop/complaints';
import { getDb } from './db';
import { complaintCounters, complaints } from './db/schema';
import { sendComplaintEmails } from './email';

const currentLimaYear = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(new Date()));

/** Crea un reclamo/queja con numeración correlativa por año y dispara los correos (CB-202, Libro de Reclamaciones). */
export async function createComplaint(data: Complaint) {
  const db = getDb();
  const year = currentLimaYear();

  const complaint = await db.transaction(async tx => {
    const [counter] = await tx
      .insert(complaintCounters)
      .values({ year, lastNumber: 1 })
      .onConflictDoUpdate({ target: complaintCounters.year, set: { lastNumber: sql`${complaintCounters.lastNumber} + 1` } })
      .returning({ lastNumber: complaintCounters.lastNumber });

    const [row] = await tx
      .insert(complaints)
      .values({
        year,
        sequence: counter.lastNumber,
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
        amountCents: data.amount === undefined ? null : Math.round(data.amount * 100),
        detail: data.detail,
        consumerRequest: data.consumerRequest
      })
      .returning();
    return row;
  });

  await sendComplaintEmails(complaint);
  return complaint;
}
