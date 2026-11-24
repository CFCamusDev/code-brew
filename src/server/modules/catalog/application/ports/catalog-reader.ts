import type { LineStatus, ProductStatus, ProfileContent } from '../../domain/catalog';

// Lectura del catálogo para el público. Devuelve los datos tal como están; qué se muestra lo decide el dominio.

export interface ProductRecord {
  id: number;
  slug: string;
  name: string;
  releaseNumber: number | null;
  status: ProductStatus | null;
  launchAt: Date | null;
  roast: string;
  grinds: string[];
  profile: (ProfileContent & { colors: { color?: string; tint?: string; glow?: string }; revealedFields: string[] }) | null;
  media: { view: string; url: string; alt: string }[];
  variants: VariantRecord[];
}

/** Presentación; si es un pack, trae sus componentes (bundle_items) con el stock de cada uno. */
export interface VariantRecord {
  sku: string;
  format: string;
  priceCents: number;
  stock: number;
  active: boolean;
  components: { productName: string; format: string; quantity: number; stock: number; active: boolean }[];
}

export interface LineRecord {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: LineStatus;
  theme: Record<string, string>;
  template: string;
}

export interface CatalogReader {
  /** Línea por slug con sus productos en orden de lanzamiento; null si no existe. */
  findLine(slug: string): Promise<{ line: LineRecord; products: ProductRecord[] } | null>;
  /** Producto por slug con su línea; null si no existe o no tiene línea. */
  findProduct(slug: string): Promise<{ line: LineRecord; product: ProductRecord } | null>;
  /** Líneas publicadas (status active) en su orden, cada una con sus productos en orden de lanzamiento. */
  listActiveLines(): Promise<{ line: LineRecord; products: ProductRecord[] }[]>;
}
