import { createOrder } from './application/create-order';
import type { OrderingDeps } from './application/ports/ports';
import { quoteCartUseCase } from './application/quote-cart';
import { quoteOrder } from './application/quote-order';
import { updateOrderItems } from './application/update-order-items';
import type { CartLine, OrderCustomer } from './domain/types';
import {
  createDrizzleCatalogReader,
  createDrizzleOrderRepository,
  createShippingProvider,
  type Executor
} from './infrastructure/drizzle-ordering';

// API pública del módulo ordering. Raíz de composición: aquí se enlazan los adaptadores Drizzle y el módulo shipping.

export type { CartLine, CatalogVariant, OrderCustomer, Quote, QuoteIssue, QuoteLine, QuoteZone } from './domain/types';
export { CartIssuesError } from './domain/types';
export type { OrderingDeps } from './application/ports/ports';

/**
 * Casos de uso de pedidos sobre una conexión o transacción. Para crear o modificar pedidos, el llamador abre la
 * transacción con UnitOfWork: `unitOfWork.run(tx => orderingFor(tx).createOrder(...))`.
 */
export function orderingFor(executor: Executor) {
  const deps: OrderingDeps = {
    catalog: createDrizzleCatalogReader(executor),
    shipping: createShippingProvider(executor),
    orders: createDrizzleOrderRepository(executor)
  };
  return {
    quoteCart: (items: CartLine[], destination?: { zoneSlug?: string; region?: string }) => quoteCartUseCase(deps, items, destination),
    quoteOrder: (order: Parameters<typeof quoteOrder>[1]) => quoteOrder(deps, order),
    createOrder: (items: CartLine[], customer: OrderCustomer) => createOrder(deps, items, customer),
    updateOrderItems: (orderId: string, items: CartLine[]) => updateOrderItems(deps, orderId, items)
  };
}
