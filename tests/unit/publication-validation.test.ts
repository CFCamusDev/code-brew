import { describe, expect, it } from 'vitest';
import { assertProductTransition, ISSUE_MESSAGES, publicationIssues, PublicationError, type ProductForPublication, type PublicationIssue } from '../../src/server/modules/catalog/domain/catalog';

const complete: ProductForPublication = { id: 1, status: 'draft', lineId: 1, profile: { tagline: 'Frase', method: 'Espresso', description: 'Descripción' }, imageCount: 1, variants: [{ active: true, priceCents: 3400 }] };
describe('requisitos de activación y mensajes por faltante', () => {
  it.each<[Partial<ProductForPublication>, PublicationIssue]>([
    [{ lineId: null }, 'missing_line'],
    [{ profile: { ...complete.profile!, tagline: ' ' } }, 'missing_tagline'],
    [{ profile: { ...complete.profile!, method: '\t' } }, 'missing_method'],
    [{ profile: { ...complete.profile!, description: '' } }, 'missing_description'],
    [{ imageCount: 0 }, 'missing_image'],
    [{ variants: [] }, 'missing_active_variant'],
    [{ variants: [{ active: false, priceCents: 3400 }] }, 'missing_active_variant'],
    [{ variants: [{ active: true, priceCents: 0 }] }, 'missing_price'],
    [{ variants: [{ active: true, priceCents: -1 }] }, 'missing_price'],
    [{ variants: [...complete.variants, { active: true, priceCents: 0 }] }, 'missing_price']
  ])('%j informa %s sin ocultar el motivo', (change, code) => {
    expect(publicationIssues({ ...complete, ...change }, 'active')).toEqual([code]);
    try { assertProductTransition({ ...complete, ...change }, 'active'); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(PublicationError);
      expect((error as PublicationError).issues).toEqual([code]);
      expect((error as Error).message).toContain(ISSUE_MESSAGES[code]);
    }
  });
  it('una presentación inactiva sin precio no impide activar las válidas', () => {
    expect(publicationIssues({ ...complete, variants: [...complete.variants, { active: false, priceCents: 0 }] }, 'active')).toEqual([]);
  });
  it('revalida un producto activo para evitar eludir requisitos por edición o reintento', () => {
    expect(() => assertProductTransition({ ...complete, status: 'active', imageCount: 0 }, 'active')).toThrow(PublicationError);
    expect(assertProductTransition({ ...complete, status: 'active' }, 'active')).toBe('active');
  });
});
