import type { LineStatus, ProductForPublication, ProductStatus } from '../../domain/catalog';

// Puertos del catálogo. Las implementaciones operan dentro de la transacción del llamador (UnitOfWork).

export interface CatalogLine {
  id: number;
  slug: string;
  name: string;
  status: LineStatus;
}

export interface LineRepository {
  /** Bloquea la línea (FOR UPDATE) para cambiar su estado; null si no existe. */
  lockLine(lineId: number): Promise<CatalogLine | null>;
  /** Productos de la línea anunciados o a la venta. */
  countPublishableProducts(lineId: number): Promise<number>;
  updateStatus(lineId: number, status: LineStatus): Promise<void>;
}

export interface ProductRepository {
  /** Bloquea el producto (FOR UPDATE) y reúne lo que piden las reglas de publicación: perfil, imágenes y presentaciones. */
  lockForPublication(productId: number): Promise<ProductForPublication | null>;
  /**
   * Cambia el estado. Mantiene `products.active` en sincronía mientras conviven ambos campos
   * (solo `active` se puede comprar) y fija `launch_at` en el primer lanzamiento.
   */
  updateStatus(productId: number, status: ProductStatus, launchedAt: Date | null): Promise<void>;
}
