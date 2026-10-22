const pen = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 3400 → "S/ 34.00" */
export function formatPEN(cents: number): string {
  return `S/ ${pen.format(cents / 100)}`;
}

/** 123 → "CB-000123" */
export function formatOrderNumber(number: number): string {
  return `CB-${String(number).padStart(6, '0')}`;
}
