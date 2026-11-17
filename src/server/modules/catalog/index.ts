import { getDb } from '../../../lib/server/db';
import { systemClock } from '../../shared/clock';
import { unitOfWork, type Transaction } from '../../shared/unit-of-work';
import { getPublicLine, getPublicLineProducts, getPublicProduct } from './application/catalog-queries';
import { activateLine, archiveLine, publishProduct, type CatalogDeps } from './application/catalog-use-cases';
import type { ProductStatus } from './domain/catalog';
import { createDrizzleCatalogReader } from './infrastructure/drizzle-catalog-reader';
import { createDrizzleLineRepository, createDrizzleProductRepository } from './infrastructure/drizzle-catalog-repositories';
import { createLineAdminRepository } from './infrastructure/drizzle-line-admin-repository';
import { createLine, editLine } from './application/manage-lines';
import type { LineData } from './application/ports/line-admin-repository';

export type { AdminLine } from './application/ports/line-admin-repository';
const lineAdmin = createLineAdminRepository(getDb);
export const listAdminLines = () => lineAdmin.list();
export const addAdminLine = (data: LineData) => createLine(lineAdmin, data);
export const editAdminLine = (id: number, data: LineData) => editLine(lineAdmin, id, data);

// API pública del módulo catalog (ADR 0003). Raíz de composición: cada caso de uso corre en su propia transacción.

export {
  canTransitionLine,
  canTransitionProduct,
  InvalidTransitionError,
  ISSUE_MESSAGES,
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

/** Publicación dentro de la transacción del editor: los cambios y su validación se confirman juntos. */
export const catalogFor = (tx: Transaction) => ({
  changeProductStatus: (productId: number, target: ProductStatus) => publishProduct({ lines: createDrizzleLineRepository(tx), products: createDrizzleProductRepository(tx), clock: systemClock }, productId, target)
});

/** ActivarLinea. */
export const publishLine = (lineId: number) => inTransaction(deps => activateLine(deps, lineId));

/** ArchivarLinea. */
export const retireLine = (lineId: number) => inTransaction(deps => archiveLine(deps, lineId));

export type { PublicProductView, PublicVariant } from './application/catalog-queries';

const reader = createDrizzleCatalogReader(getDb);

/** Línea publicada con sus productos visibles; null si el público no debe verla. */
export const findPublicLine = (slug: string) => getPublicLine(reader, slug);

/** Línea publicada con la vista completa de sus productos visibles (portada y página de producto); null si no se publica. */
export const findPublicLineProducts = async (slug: string) => {
  const found = await getPublicLineProducts(reader, slug);
  if (!found) return null;
  const { slug: lineSlug, name, description, theme, template } = found.line;
  return { line: { slug: lineSlug, name, description, theme, template }, products: found.products };
};

/** Producto anunciado o a la venta de una línea publicada, con solo sus campos revelados; null si no corresponde. */
export const findPublicProduct = (slug: string) => getPublicProduct(reader, slug);
