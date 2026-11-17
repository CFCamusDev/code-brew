import { asc, eq } from 'drizzle-orm';
import type { getDb } from '../../../../lib/server/db';
import { productLines } from '../../../../lib/server/db/schema';
import { ConflictError } from '../../../shared/errors';
import type { LineAdminRepository } from '../application/ports/line-admin-repository';

async function uniqueSlug<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505') throw new ConflictError('Ya existe una línea con ese slug.', 'duplicate_slug');
    throw error;
  }
}
export function createLineAdminRepository(getDatabase: typeof getDb): LineAdminRepository {
  return {
    list: () => getDatabase().select().from(productLines).orderBy(asc(productLines.sortOrder), asc(productLines.id)),
    create: data => uniqueSlug(async () => {
      const [row] = await getDatabase().insert(productLines).values(data).returning();
      return row;
    }),
    update: (id, data) => uniqueSlug(async () => {
      const [row] = await getDatabase().update(productLines).set(data).where(eq(productLines.id, id)).returning();
      return row ?? null;
    })
  };
}
