// CSV para Excel: UTF-8 con BOM (tildes correctas), separador coma y fin de línea CRLF.

type Cell = string | number | null | undefined;

/** Evita que Excel interprete como fórmula un texto escrito por un cliente (inyección de CSV). */
function neutralize(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: Cell) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const text = neutralize(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Cell[][]) {
  return '﻿' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Céntimos a soles con punto decimal, como número que Excel puede sumar. */
export function soles(cents: number) {
  return (cents / 100).toFixed(2);
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
