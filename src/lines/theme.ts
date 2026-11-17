// Tema de una línea (ADR 0004): variables CSS guardadas en product_lines.theme y editables desde el panel.
// Se aplican en el atributo style del contenedor de la línea, así que solo pasan propiedades personalizadas (--algo)
// con valores de color, medida o tipografía. Lo demás se descarta: el tema no puede romper la página ni inyectar CSS.

const NAME = /^--[a-zA-Z][a-zA-Z0-9-]{0,47}$/;
/** Caracteres de un valor CSS simple: #hex, rgb()/hsl()/oklch(), números, %, comas y nombres. */
const VALUE = /^[#a-zA-Z0-9 .,%()+\-/]{1,120}$/;
/** Funciones que cargan recursos o ejecutan algo: nunca en un tema. */
const FORBIDDEN = /\b(url|expression|image-set|image|element|src)\s*\(/i;

/** Variables del tema que se pueden aplicar, en el orden guardado. */
export function sanitizeTheme(theme: Record<string, unknown> | null | undefined): [string, string][] {
  if (!theme || typeof theme !== 'object') return [];
  return Object.entries(theme).flatMap(([name, value]) => {
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    return NAME.test(name) && VALUE.test(trimmed) && !FORBIDDEN.test(trimmed) ? [[name, trimmed] as [string, string]] : [];
  });
}

/** Declaraciones para un atributo style («--a:#fff;--b:2px»); vacío si el tema no tiene nada aplicable. */
export function themeStyle(theme: Record<string, unknown> | null | undefined): string {
  return sanitizeTheme(theme)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/** Une estilos en línea sin dejar «;» sueltos; undefined si no queda nada (no se pinta el atributo). */
export function joinStyles(...styles: (string | undefined)[]): string | undefined {
  const joined = styles.filter(Boolean).join(';');
  return joined || undefined;
}
