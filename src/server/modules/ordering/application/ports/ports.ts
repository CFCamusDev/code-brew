import type { ShippingRules } from '../../domain/cart-quote';
import type { CatalogVariant, OrderCustomer, QuoteLine } from '../../domain/types';

/** Lectura del catálogo vigente (precios, stock, moliendas). */
export interface CatalogReader {
  findVariants(skus: string[]): Promise<CatalogVariant[]>;
}

/** Envío visto desde pedidos: lo implementa un adaptador sobre el módulo shipping. */
export interface ShippingProvider {
  load(): Promise<ShippingRules>;
}

export interface NewOrder {
  customer: OrderCustomer;
  zone: { id: number; name: string };
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface OrderLineRecord extends QuoteLine {
  variantId: number;
}

export interface OrderRepository {
  findActiveZoneBySlug(slug: string): Promise<{ id: number; name: string } | null>;
  findZoneSlugById(id: number): Promise<string | null>;
  insertOrder(order: NewOrder): Promise<{ id: string; number: number }>;
  /** Bloquea el pedido para modificarlo (FOR UPDATE). */
  lockOrder(orderId: string): Promise<{ status: string; shippingZoneId: number | null; shippingRegion: string } | null>;
  /** Reemplaza todas las líneas del pedido por las dadas. */
  replaceItems(orderId: string, lines: OrderLineRecord[]): Promise<void>;
  updateTotals(orderId: string, totals: { subtotalCents: number; shippingCents: number; totalCents: number }): Promise<void>;
}

export interface OrderingDeps {
  catalog: CatalogReader;
  shipping: ShippingProvider;
  orders: OrderRepository;
}
