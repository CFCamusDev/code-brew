# ADR 0004 · Identidad visual por línea: tema y plantilla

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
Pipeline tiene una identidad propia (verde bosque, crema, terracota, bolsas por perfil). Las futuras líneas tendrán un enfoque distinto.

## Decisión
Cada línea define un `theme` (variables CSS, editable desde el panel) y un `template` (plantilla de página elegida de un registro en `src/lines/*`). Una plantilla nueva es código y se revisa por PR.

## Consecuencias
- Crear una línea con otros colores es cuestión del panel.
- Una línea con estructura distinta requiere una plantilla nueva.
- Los componentes de Pipeline (Pouch, perfil) viven en `src/lines/pipeline/`.

## Alternativas consideradas
- Una sola plantilla con tema: insuficiente si las líneas cambian de estructura.
- Plantillas editables desde el panel: complejidad y riesgo de accesibilidad.
