import { ConflictError } from '../../../shared/errors';

/** Línea pedida por el cliente: solo identifica qué quiere; precios y totales los decide el servidor. */
export interface CartLine {
  sku: string;
  grind: string;
  quantity: number;
}

export interface QuoteLine extends CartLine {
  productName: string;
  format: string;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface QuoteIssue {
  sku: string;
  message: string;
}

export interface QuoteZone {
  slug: string;
  name: string;
  eta: string;
  priceCents: number;
  freeFromCents: number | null;
  freeFromBags: number | null;
  /** Departamentos que atiende; null = todos. */
  regions: string[] | null;
  /** Tiene tarifas distintas según el departamento (se muestra "desde"). */
  hasRegionRates: boolean;
}

/** Respuesta de cotización: precios, stock y envío vigentes. */
export interface Quote {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  zones: QuoteZone[];
  /** Bolsas en el pedido (el Pack Developer cuenta 2). */
  bags: number;
  subtotalCents: number;
  shippingCents: number | null;
  totalCents: number | null;
}

/** Variante del catálogo con lo necesario para cotizarla. */
export interface CatalogVariant {
  variantId: number;
  sku: string;
  format: string;
  priceCents: number;
  stock: number;
  bags: number;
  variantActive: boolean;
  productName: string;
  grinds: string[];
  productActive: boolean;
}

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  document?: string;
  zone: string;
  region: string;
  city: string;
  district: string;
  address: string;
  reference?: string;
  notes?: string;
}

/** El carrito no se puede comprar tal como está (stock, molienda, producto inactivo o zona no disponible). */
export class CartIssuesError extends ConflictError {
  constructor(public issues: QuoteIssue[]) {
    super('El carrito tiene productos no disponibles', 'cart_issues');
  }
}
