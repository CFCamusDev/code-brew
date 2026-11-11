# ADR 0003 · Catálogo por líneas; Pipeline es la única línea activa; packs compuestos

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
Los cinco perfiles del Pipeline viven hoy en `src/data/pipeline.ts`. El catálogo anterior (Espresso Amazonas, Pack Developer, Microlote) ya no forma parte del negocio. No existe el concepto de línea ni de estado de lanzamiento. No hay pedidos reales todavía.

## Decisión
Se modelan líneas (`product_lines`), productos con estado (draft, upcoming, active, discontinued), contenido editorial (`product_profiles`) e imágenes por vista (`product_media`). Pipeline es la única línea activa. Los productos del catálogo anterior se eliminan y los SKU se alinean con la marca (`hotfix-250`). Un pack es un producto que contiene a otros (`bundle_items`): no tiene stock propio y su disponibilidad se deriva de los componentes.

## Consecuencias
- Agregar una línea o activar un producto se hace desde el panel, sin desplegar código.
- Hay que migrar el contenido de `pipeline.ts` y `catalog.json` a la base de datos con un seed idempotente.
- Los packs reservan y descuentan stock de cada componente.

## Alternativas consideradas
- Mantener una línea "Catálogo base": descartada porque esos productos ya no existen.
- Stock propio para packs: descartada porque desincroniza el inventario real.
