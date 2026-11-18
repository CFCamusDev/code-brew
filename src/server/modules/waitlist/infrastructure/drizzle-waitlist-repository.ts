import { eq } from 'drizzle-orm';
import { productLines, products, waitlistSubscriptions } from '../../../../lib/server/db/schema';
import type { Transaction } from '../../../shared/unit-of-work';
import type { WaitlistRepository } from '../application/ports/waitlist-repository';

export function createWaitlistRepository(tx: Transaction): WaitlistRepository {
  return {
    async findTarget(slug) {
      // Mismo orden de bloqueo que el editor: producto y después línea.
      const [product] = await tx.select({ id: products.id, status: products.status, lineId: products.lineId }).from(products).where(eq(products.slug, slug)).for('share');
      if (!product?.lineId) return null;
      const [line] = await tx.select({ status: productLines.status }).from(productLines).where(eq(productLines.id, product.lineId)).for('share');
      return { id: product.id, status: product.status, lineStatus: line?.status ?? null };
    },
    async add(email, productId) {
      await tx.insert(waitlistSubscriptions).values({ email, productId, consent: true }).onConflictDoNothing({ target: [waitlistSubscriptions.email, waitlistSubscriptions.productId] });
    }
  };
}
