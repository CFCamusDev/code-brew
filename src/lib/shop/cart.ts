import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';
import catalog from '../../data/catalog.json';
import type { CartLine } from './checkout';
import { MAX_LINES, MAX_QUANTITY } from './limits';

// Estado del carrito compartido entre islas React y scripts de la landing.
// Solo guarda sku, molienda y cantidad: los precios vigentes siempre los calcula el servidor al cotizar.

export const cartLines = persistentAtom<CartLine[]>('codebrew:cart', [], {
  encode: JSON.stringify,
  // Descarta lo que no tenga forma válida (datos viejos o editados a mano en el navegador).
  decode(value) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
    } catch {
      return [];
    }
  }
});

function isCartLine(value: unknown): value is CartLine {
  const line = value as CartLine;
  return (
    typeof line?.sku === 'string' &&
    typeof line.grind === 'string' &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= MAX_QUANTITY
  );
}

export const cartOpen = atom(false);

export const cartCount = computed(cartLines, lines => lines.reduce((sum, line) => sum + line.quantity, 0));

const variants = new Map(
  catalog.products.flatMap(product =>
    product.variants.map(variant => [variant.sku, { productName: product.name, format: variant.format, price: variant.price }] as const)
  )
);

/** Nombre, formato y precio de catálogo para mostrar en el carrito antes de cotizar con el servidor. */
export function describeSku(sku: string) {
  return variants.get(sku);
}

export function addToCart(sku: string, grind: string, quantity = 1) {
  const lines = cartLines.get();
  const existing = lines.find(line => line.sku === sku && line.grind === grind);
  if (existing) {
    setQuantity(sku, grind, existing.quantity + quantity);
  } else if (lines.length < MAX_LINES) {
    cartLines.set([...lines, { sku, grind, quantity: Math.min(quantity, MAX_QUANTITY) }]);
  }
}

export function setQuantity(sku: string, grind: string, quantity: number) {
  if (quantity < 1) return removeFromCart(sku, grind);
  cartLines.set(
    cartLines.get().map(line =>
      line.sku === sku && line.grind === grind ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY) } : line
    )
  );
}

export function removeFromCart(sku: string, grind: string) {
  cartLines.set(cartLines.get().filter(line => !(line.sku === sku && line.grind === grind)));
}

export function clearCart() {
  cartLines.set([]);
}
