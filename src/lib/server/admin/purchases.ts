import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { adminUsers, purchases } from '../db/schema';
import { AdminActionError } from './orders';

export type PurchaseCategory = (typeof purchases.$inferSelect)['category'];

export const CATEGORY_LABEL: Record<PurchaseCategory, string> = {
  cafe_verde: 'Café verde',
  tueste: 'Tueste',
  empaques: 'Empaques',
  envios: 'Envíos',
  marketing: 'Marketing',
  servicios: 'Servicios',
  otros: 'Otros'
};

export interface PurchaseInput {
  purchasedOn: string;
  supplier: string;
  category: PurchaseCategory;
  description: string;
  documentNumber?: string;
  amountCents: number;
  notes?: string;
}

/** "2026-10" → rango [2026-10-01, 2026-11-01) */
function monthRange(month: string) {
  const [year, m] = month.split('-').map(Number);
  const start = `${year}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, next };
}

export async function listPurchases(month: string) {
  const { start, next } = monthRange(month);
  const db = getDb();
  const where = and(gte(purchases.purchasedOn, start), lt(purchases.purchasedOn, next));
  const [rows, byCategory] = await Promise.all([
    db
      .select({
        id: purchases.id,
        purchasedOn: purchases.purchasedOn,
        supplier: purchases.supplier,
        category: purchases.category,
        description: purchases.description,
        documentNumber: purchases.documentNumber,
        amountCents: purchases.amountCents,
        notes: purchases.notes,
        adminName: adminUsers.name
      })
      .from(purchases)
      .leftJoin(adminUsers, eq(adminUsers.id, purchases.adminUserId))
      .where(where)
      .orderBy(desc(purchases.purchasedOn), desc(purchases.id)),
    db
      .select({ category: purchases.category, total: sql<number>`sum(${purchases.amountCents})::int` })
      .from(purchases)
      .where(where)
      .groupBy(purchases.category)
      .orderBy(asc(purchases.category))
  ]);
  return { rows, byCategory, totalCents: byCategory.reduce((sum, row) => sum + row.total, 0) };
}
export type AdminPurchase = Awaited<ReturnType<typeof listPurchases>>['rows'][number];

export async function createPurchase(input: PurchaseInput, adminUserId: number) {
  await getDb()
    .insert(purchases)
    .values({ ...input, documentNumber: input.documentNumber || null, notes: input.notes || null, adminUserId });
}

export async function updatePurchase(id: number, input: PurchaseInput) {
  const [row] = await getDb()
    .update(purchases)
    .set({ ...input, documentNumber: input.documentNumber || null, notes: input.notes || null })
    .where(eq(purchases.id, id))
    .returning({ id: purchases.id });
  if (!row) throw new AdminActionError('Compra no encontrada.');
}

export async function deletePurchase(id: number) {
  await getDb().delete(purchases).where(eq(purchases.id, id));
}
