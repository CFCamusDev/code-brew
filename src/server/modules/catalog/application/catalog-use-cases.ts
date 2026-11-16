import type { Clock } from '../../../shared/clock';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import {
  assertProductTransition,
  canTransitionLine,
  InvalidTransitionError,
  lineActivationIssues,
  type LineStatus,
  type ProductStatus
} from '../domain/catalog';
import type { LineRepository, ProductRepository } from './ports/catalog-repositories';

export interface CatalogDeps {
  lines: LineRepository;
  products: ProductRepository;
  clock: Clock;
}

/**
 * Caso de uso PublicarProducto: cambia el estado de un producto (anunciar, lanzar, descontinuar…) si la transición es
 * válida y cumple los requisitos. Debe correr bajo UnitOfWork: bloquea el producto mientras decide.
 */
export async function publishProduct(deps: CatalogDeps, productId: number, target: ProductStatus): Promise<{ from: ProductStatus; to: ProductStatus }> {
  const product = await deps.products.lockForPublication(productId);
  if (!product) throw new NotFoundError('Producto no encontrado.');
  const from = assertProductTransition(product, target);
  if (from !== target) await deps.products.updateStatus(productId, target, target === 'active' ? deps.clock.now() : null);
  return { from, to: target };
}

async function changeLineStatus(deps: CatalogDeps, lineId: number, target: LineStatus) {
  const line = await deps.lines.lockLine(lineId);
  if (!line) throw new NotFoundError('Línea no encontrada.');
  if (line.status === target) return { from: line.status, to: target };
  if (!canTransitionLine(line.status, target)) throw new InvalidTransitionError('línea', line.status, target);
  if (target === 'active') {
    const issues = lineActivationIssues({ publishableProducts: await deps.lines.countPublishableProducts(lineId) });
    if (issues.length) throw new ConflictError(issues.join(' '), 'line_requirements');
  }
  await deps.lines.updateStatus(lineId, target);
  return { from: line.status, to: target };
}

/** Caso de uso ActivarLinea: publica la línea si tiene al menos un producto anunciado o a la venta. */
export function activateLine(deps: CatalogDeps, lineId: number) {
  return changeLineStatus(deps, lineId, 'active');
}

/** Caso de uso ArchivarLinea: la retira de la tienda. Sus productos conservan su estado para poder reactivarla. */
export function archiveLine(deps: CatalogDeps, lineId: number) {
  return changeLineStatus(deps, lineId, 'archived');
}
