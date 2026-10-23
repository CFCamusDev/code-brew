const pen = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 3400 → "S/ 34.00" */
export function formatPEN(cents: number): string {
  return `S/ ${pen.format(cents / 100)}`;
}

/** 123 → "CB-000123" */
export function formatOrderNumber(number: number): string {
  return `CB-${String(number).padStart(6, '0')}`;
}

const dateTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  dateStyle: 'short',
  timeStyle: 'short',
  hourCycle: 'h23'
});

/** Fecha y hora de Lima: "22/10/26, 14:05" */
export function formatDateTime(date: Date | string): string {
  return dateTime.format(new Date(date));
}
