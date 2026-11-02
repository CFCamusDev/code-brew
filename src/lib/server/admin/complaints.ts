import { and, count, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { adminUsers, complaints } from '../db/schema';
import { AdminActionError } from './orders';

type Status = (typeof complaints.$inferSelect)['status'];

const PAGE_SIZE = 25;

export interface ComplaintFilters {
  status?: Status;
}

export async function listComplaints({ status, page }: ComplaintFilters & { page: number }) {
  const db = getDb();
  const where = status ? eq(complaints.status, status) : undefined;

  const [rows, [{ total }], byStatus] = await Promise.all([
    db
      .select({
        id: complaints.id,
        year: complaints.year,
        sequence: complaints.sequence,
        type: complaints.type,
        status: complaints.status,
        consumerName: complaints.consumerName,
        productOrService: complaints.productOrService,
        createdAt: complaints.createdAt
      })
      .from(complaints)
      .where(where)
      .orderBy(desc(complaints.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(complaints).where(where),
    db
      .select({ status: complaints.status, total: count() })
      .from(complaints)
      .groupBy(complaints.status)
      .then(rows => Object.fromEntries(rows.map(row => [row.status, row.total])) as Record<Status, number>)
  ]);

  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), byStatus };
}

export async function getComplaint(id: number) {
  const db = getDb();
  const [row] = await db
    .select({
      id: complaints.id,
      year: complaints.year,
      sequence: complaints.sequence,
      type: complaints.type,
      consumerName: complaints.consumerName,
      consumerDocument: complaints.consumerDocument,
      consumerEmail: complaints.consumerEmail,
      consumerPhone: complaints.consumerPhone,
      consumerAddress: complaints.consumerAddress,
      isMinor: complaints.isMinor,
      guardianName: complaints.guardianName,
      guardianDocument: complaints.guardianDocument,
      productOrService: complaints.productOrService,
      amountCents: complaints.amountCents,
      detail: complaints.detail,
      consumerRequest: complaints.consumerRequest,
      status: complaints.status,
      response: complaints.response,
      respondedAt: complaints.respondedAt,
      respondedByName: adminUsers.name,
      createdAt: complaints.createdAt
    })
    .from(complaints)
    .leftJoin(adminUsers, eq(adminUsers.id, complaints.respondedBy))
    .where(eq(complaints.id, id));
  return row;
}

/** Registra la respuesta de un reclamo pendiente. No se puede responder dos veces. */
export async function answerComplaint(id: number, adminUserId: number, response: string) {
  const [row] = await getDb()
    .update(complaints)
    .set({ status: 'answered', response, respondedAt: new Date(), respondedBy: adminUserId })
    .where(and(eq(complaints.id, id), eq(complaints.status, 'pending')))
    .returning({ id: complaints.id });
  if (!row) throw new AdminActionError('El reclamo no existe o ya fue respondido.');
}
