import data from './pipeline.json';

/** Contenido editorial de Pipeline. Precios, moliendas y stock viven en la base de datos; el seed carga este contenido en
 * product_profiles (S2.5). */
export interface PipelineProduct {
 slug: string; catalogSlug: string; name: string; num: string; status: 'available' | 'upcoming';
 color: string; tint: string; glow: string; tagline: string; method: string; roast: string;
 description: string | null; notes: string[]; facts: string[][]; profile: (string | number)[][];
 recipeFor: string; recipe: string[][];
}
export const PIPELINE: PipelineProduct[] = data as PipelineProduct[];
