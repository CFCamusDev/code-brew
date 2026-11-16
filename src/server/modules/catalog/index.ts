import { systemClock } from '../../shared/clock';
import { unitOfWork } from '../../shared/unit-of-work';
import { activateLine, archiveLine, publishProduct, type CatalogDeps } from './application/catalog-use-cases';
import type { ProductStatus } from './domain/catalog';
import { createDrizzleLineRepository, createDrizzleProductRepository } from './infrastructure/drizzle-catalog-repositories';

// API pública del módulo catalog (ADR 0003). Raíz de composición: cada caso de uso corre en su propia transacción.

export {
  canTransitionLine,
  canTransitionProduct,
  InvalidTransitionError,
  LINE_STATUSES,
  PRODUCT_STATUSES,
  PublicationError,
  publicationIssues,
  type LineStatus,
  type ProductForPublication,
  type ProductStatus,
  type PublicationIssue
} from './domain/catalog';
export type { CatalogLine, LineRepository, ProductRepository } from './application/ports/catalog-repositories';

const inTransaction = <T>(work: (deps: CatalogDeps) => Promise<T>) =>
  unitOfWork.run(tx => work({ lines: createDrizzleLineRepository(tx), products: createDrizzleProductRepository(tx), clock: systemClock }));

/** PublicarProducto: anunciar, lanzar, volver a borrador o descontinuar. */
export const changeProductStatus = (productId: number, target: ProductStatus) => inTransaction(deps => publishProduct(deps, productId, target));

/** ActivarLinea. */
export const publishLine = (lineId: number) => inTransaction(deps => activateLine(deps, lineId));

/** ArchivarLinea. */
export const retireLine = (lineId: number) => inTransaction(deps => archiveLine(deps, lineId));
