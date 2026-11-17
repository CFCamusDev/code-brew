#!/usr/bin/env node
// Presupuesto de JS inicial por página (S5.7, línea base en docs/performance/baseline.md).
// Pide cada página al servidor ya levantado y suma, en gzip, lo que el navegador baja sin interacción:
// scripts del HTML, islas (component-url y renderer-url) e importaciones estáticas, sin los import() dinámicos.
// Falla si una página pasa su presupuesto o si three o gsap entran en ese JS inicial.
// Uso: node scripts/perf/js-budget.mjs [url base]   (por defecto INTEGRATION_BASE_URL o http://127.0.0.1:4321)
import { appendFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BASE_URL = process.argv[2] ?? process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4321';

/** Presupuestos en KB gzip. */
export const BUDGETS = [
  { path: '/', kb: 80 },
  { path: '/producto/hotfix', kb: 80 },
  { path: '/checkout', kb: 120 }
];

/** Librerías que no deben llegar al JS inicial, reconocidas por marcas que sobreviven a la minificación
 * (nombres de propiedad y cadenas; los nombres de clase como WebGLRenderer se acortan). */
export const FORBIDDEN = [
  { name: 'three', pattern: /__THREE__/ },
  { name: 'gsap', pattern: /GreenSock|_gsap\b|ScrollTrigger/ }
];

/** URLs de JS que el HTML carga de entrada. */
export function entryUrls(html, pageUrl) {
  const urls = new Set();
  const inline = [];
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) urls.add(new URL(src, pageUrl).href);
    else if (/type=["']module["']/i.test(attrs)) inline.push(body);
  }
  for (const [, href] of html.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi)) urls.add(new URL(href, pageUrl).href);
  for (const [, attr] of html.matchAll(/\b(?:component-url|renderer-url)=["']([^"']+)["']/gi)) urls.add(new URL(attr, pageUrl).href);
  for (const code of inline) for (const spec of staticImports(code)) urls.add(new URL(spec, pageUrl).href);
  return { urls: [...urls], inline };
}

/** Especificadores de importaciones estáticas (import … from, import "…", export … from); ignora import(). */
export function staticImports(code) {
  const specs = [];
  const pattern = /\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g;
  for (const [, spec] of code.matchAll(pattern)) specs.push(spec);
  return specs;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return response.text();
}

async function measure(path) {
  const pageUrl = new URL(path, BASE_URL).href;
  const html = await fetchText(pageUrl);
  const { urls, inline } = entryUrls(html, pageUrl);
  const seen = new Map();
  const queue = [...urls];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    const code = await fetchText(url);
    seen.set(url, code);
    for (const spec of staticImports(code)) queue.push(new URL(spec, url).href);
  }
  const sources = [...seen.values(), ...inline];
  const gzip = sources.reduce((sum, code) => sum + gzipSync(code).length, 0);
  const raw = sources.reduce((sum, code) => sum + Buffer.byteLength(code), 0);
  const forbidden = FORBIDDEN.filter(({ pattern }) => sources.some(code => pattern.test(code))).map(({ name }) => name);
  return { files: seen.size, raw, gzip, forbidden };
}

const kb = bytes => (bytes / 1024).toFixed(1);

async function main() {
  const rows = [];
  let failed = false;
  for (const { path, kb: budget } of BUDGETS) {
    const result = await measure(path);
    const over = result.gzip > budget * 1024;
    const ok = !over && result.forbidden.length === 0;
    failed ||= !ok;
    rows.push(`| \`${path}\` | ${result.files} | ${kb(result.raw)} KB | ${kb(result.gzip)} KB | ${budget} KB | ${result.forbidden.join(', ') || 'no'} | ${ok ? '✅' : '❌'} |`);
  }
  const table = [
    '### Presupuesto de JS inicial',
    '',
    '| Página | Archivos | Tamaño | gzip | Presupuesto | three/gsap | |',
    '|---|---|---|---|---|---|---|',
    ...rows
  ].join('\n');
  console.log(table);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n');
  if (failed) {
    console.error('\nUna página supera su presupuesto de JS o carga three/gsap de entrada (ver docs/performance/baseline.md).');
    process.exit(1);
  }
}

// Solo corre al ejecutarse como script; las pruebas unitarias importan las funciones.
if (process.argv[1]?.endsWith('js-budget.mjs')) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
