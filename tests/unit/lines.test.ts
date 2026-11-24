import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveTemplate, TEMPLATE_NAMES } from '../../src/lines/registry';
import { joinStyles, sanitizeTheme, themeStyle } from '../../src/lines/theme';

// Tema y plantilla por línea (S5.9, ADR 0004).

describe('tema de una línea', () => {
  it('aplica variables CSS de color, medida y tipografía', () => {
    expect(
      themeStyle({
        '--cb-terracotta-bright': '#7fd6a0',
        '--cb-forest-950': 'rgb(13, 27, 42)',
        '--radius': '12px',
        '--accent': 'var(--cb-cream)',
        '--tint': 'hsl(150 40% 50% / .5)'
      })
    ).toBe('--cb-terracotta-bright:#7fd6a0;--cb-forest-950:rgb(13, 27, 42);--radius:12px;--accent:var(--cb-cream);--tint:hsl(150 40% 50% / .5)');
  });

  it('descarta lo que podría romper la página o cargar recursos', () => {
    const unsafe = {
      color: 'red',
      '--x;color': 'red',
      '--bg': 'url(https://evil.test/x.png)',
      '--bg2': 'image(red)',
      '--break': 'red; } body { display:none',
      '--quote': '"><script>',
      '--old': 'expression(alert(1))',
      '--empty': '',
      '--number': 4 as unknown as string,
      '--ok': '#fff'
    };
    expect(sanitizeTheme(unsafe)).toEqual([['--ok', '#fff']]);
  });

  it('un tema vacío no pinta estilo', () => {
    expect(themeStyle({})).toBe('');
    expect(themeStyle(null)).toBe('');
    expect(joinStyles('', themeStyle({}))).toBeUndefined();
    expect(joinStyles('--profile-color:#1f4a35', '--a:#fff')).toBe('--profile-color:#1f4a35;--a:#fff');
  });
});

describe('plantilla de una línea', () => {
  it('usa la registrada o la base', () => {
    expect(resolveTemplate('pipeline')).toBe('pipeline');
    expect(resolveTemplate('base')).toBe('base');
    expect(resolveTemplate('no-existe')).toBe('base');
    expect(resolveTemplate('constructor')).toBe('base');
    expect(resolveTemplate(null)).toBe('base');
  });

  it('cada plantilla registrada está en los tres despachadores', () => {
    for (const dispatcher of ['src/lines/LineSection.astro', 'src/lines/ProductPage.astro', 'src/lines/ProductCard.astro']) {
      const source = readFileSync(dispatcher, 'utf8');
      for (const name of TEMPLATE_NAMES) {
        expect(source, `${dispatcher} no tiene la plantilla ${name}`).toMatch(new RegExp(`['"]?${name}['"]?\\s*:`));
      }
    }
  });
});
