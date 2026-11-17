// Renders de bolsa de Pipeline disponibles (assets/pipeline/optimized/<slug>-<vista>-<ancho>.webp). Pouch lanza un
// error si un perfil no tiene render; quien pueda recibir un producto nuevo pregunta antes con hasPouchRender.
const renders = import.meta.glob('../../assets/pipeline/optimized/*-front-720.webp');

export function hasPouchRender(slug: string): boolean {
  return `../../assets/pipeline/optimized/${slug}-front-720.webp` in renders;
}
