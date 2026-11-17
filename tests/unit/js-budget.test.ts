import { describe, expect, it } from 'vitest';
import { BUDGETS, FORBIDDEN, entryUrls, staticImports } from '../../scripts/perf/js-budget.mjs';

const PAGE = 'http://127.0.0.1:4321/producto/hotfix';

describe('presupuesto de JS (S5.7)', () => {
  it('sigue las importaciones estáticas minificadas y deja fuera los import() dinámicos', () => {
    const code = 'import{a as b}from"./react.js";import"./side.js";export{c}from"./re.js";const t=()=>import("./three.js");import.meta.url;';
    expect(staticImports(code)).toEqual(['./react.js', './side.js', './re.js']);
  });

  it('cuenta scripts del HTML, modulepreload, islas e importaciones de scripts en línea', () => {
    const html = `
      <link rel="modulepreload" href="/_astro/pre.js">
      <script type="module" src="/_astro/page.js"></script>
      <script type="module">import "/_astro/hoisted.js"; const lazy = () => import("/_astro/lazy.js");</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
      <astro-island component-url="/_astro/CartWidget.js" renderer-url="/_astro/client.js"></astro-island>`;
    const { urls, inline } = entryUrls(html, PAGE);
    expect(urls.sort()).toEqual(
      ['pre.js', 'page.js', 'CartWidget.js', 'client.js', 'hoisted.js'].map(file => `http://127.0.0.1:4321/_astro/${file}`).sort()
    );
    expect(inline).toHaveLength(1);
  });

  it('reconoce three y gsap por marcas que la minificación conserva', () => {
    const detect = (code: string) => FORBIDDEN.filter(({ pattern }: { pattern: RegExp }) => pattern.test(code)).map(({ name }: { name: string }) => name);
    expect(detect('window.__THREE__?console.warn("x"):window.__THREE__="170"')).toEqual(['three']);
    expect(detect('e._gsap||(e._gsap=new t(e))')).toEqual(['gsap']);
    expect(detect('import{a}from"./react.js"')).toEqual([]);
  });

  it('mantiene los presupuestos de la línea base', () => {
    expect(BUDGETS).toEqual([
      { path: '/', kb: 80 },
      { path: '/producto/hotfix', kb: 80 },
      { path: '/checkout', kb: 120 }
    ]);
  });
});
