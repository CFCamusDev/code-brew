import type { Clock } from '../../../../shared/clock';
import type { ShippingRules } from '../../domain/cart-quote';
import type { CatalogVariant, OrderCustomer, QuoteLine } from '../../domain/types';

/** Lectura del catálogo vigente (precios, stock físico, reservas vigentes, moliendas). */
export interface CatalogReader {
  /**
   * `now` decide qué reservas están vigentes (las vencidas se ignoran sin depender de ningún cron). `excludeOrderId`
   * deja fuera las reservas de ese pedido: el pedido no compite contra sí mismo al recotizarlo o modificarlo.
   */
  findVariants(skus: string[], options: { now: Date; excludeOrderId?: string }): Promise<CatalogVariant[]>;
}

/** Reservas de stock de los pedidos pendientes (tabla stock_reservations, ADR 0005). */
export interface StockReservations {
  /** Bloquea las variantes de esos SKU en orden de id (FOR UPDATE): dos pedidos nunca se esperan en círculo. */
  lockVariants(skus: string[]): Promise<void>;
  /** Reemplaza las reservas del pedido por las dadas, todas con el mismo vencimiento. */
  replace(orderId: string, lines: { variantId: number; quantity: number }[], expiresAt: Date): Promise<void>;
  /** Vencimiento de la reserva vigente más lejana del pedido; null si no tiene ninguna vigente. */
  currentExpiry(orderId: string, now: Date): Promise<Date | null>;
  /** Marca como liberadas las reservas vigentes de esos pedidos (cancelación). Idempotente. */
  release(orderIds: string[], now: Date): Promise<void>;
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
  reservations: StockReservations;
  clock: Clock;
}
