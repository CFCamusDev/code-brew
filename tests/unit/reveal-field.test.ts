import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import RevealField from '../../src/features/product/RevealField.astro';

describe('RevealField', () => {
  it('muestra el contenido público sin difuminarlo', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RevealField, { props: { field: 'description', label: 'Descripción', revealed: true }, slots: { default: 'Descripción revelada' } });
    expect(html).toContain('data-revealed="true"');
    expect(html).toContain('Descripción revelada');
    expect(html).not.toContain('aria-hidden');
  });
  it('oculta el slot y deja solo marcadores decorativos fuera del árbol accesible', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RevealField, { props: { field: 'facts', label: 'Ficha técnica', revealed: false }, slots: { default: 'No debe publicarse' } });
    expect(html).toContain('data-revealed="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Ficha técnica: Se revela en su lanzamiento.');
    expect(html).not.toContain('No debe publicarse');
  });
});
