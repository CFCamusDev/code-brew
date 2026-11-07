# Limpieza del cliente después del rediseño

Fecha: 2026-11-06. Rama: `redesign/client`.

## Alcance y resultado

Se revisaron las referencias de los archivos versionados, importaciones, rutas públicas, glob de imágenes y nombres construidos dinámicamente. Se retiraron 17 archivos sin consumidores (11 componentes, una hoja de estilos y cinco imágenes), con 4 835 705 bytes de contenido. Además, se eliminaron o depuraron 101 reglas CSS exclusivas de la sección Tienda retirada y del estado anterior del header (`cb-nav-profile-mode`). No se cambió el diseño activo ni los contratos comerciales.

## Archivos retirados

- `src/components/BotanicalMark.astro`
- `src/components/Corporate.astro`
- `src/components/Features.astro`
- `src/components/FinalCTA.astro`
- `src/components/HowToOrder.astro`
- `src/components/MobileStickyBar.astro`
- `src/components/Offers.astro`
- `src/components/OriginIllustration.astro`
- `src/components/ProductStage.astro`
- `src/components/Products.astro`
- `src/components/WhatsAppFloat.astro`
- `src/styles/editorial.css`
- `src/assets/demo/espresso.png`
- `src/assets/demo/microlote.png`
- `src/assets/brand/workspace-hero.webp`
- `src/assets/brand/hotfix-daily-driver.webp`
- `src/assets/brand/hotfix-daily-driver-right.webp`

## Archivos conservados deliberadamente

- Admin, backend, API, middleware, catálogo, BD y `global.css` compartido: sin cambios.
- `CoffeeExperience3D.astro`, `WorldStage.astro`, `Experience.astro`, `src/scripts/`, imágenes y dependencias de la experiencia 3D: reservados para retomarlos.
- Imágenes de productos y lifestyle importadas por `src/data/config.ts`: forman parte de configuración compartida y pueden ser consumidas por el catálogo.
- Originales de `src/assets/pipeline/`: los usa `scripts/prepare-client-images.mjs` para regenerar tamaños.
- Todos los WebP de `pipeline/optimized/`: `Pouch.astro` usa un glob y rutas construidas por producto, vista y tamaño.
- Procedencia de los recursos y licencias: conservadas; README actualizado para describir el cliente vigente.

## Validación

- `npm run typecheck`: correcto.
- `npm run build`: correcto; imagen Docker recompilada y contenedores saludables, sin migraciones ni seed.
- `npm test`: 47 pruebas aprobadas en 10 archivos. El primer intento no ejecutó pruebas por un error de permisos del entorno temporal; se repitió correctamente con acceso a esos archivos.
- 22 capturas antes/después a 1440 y 390 px: portada, cinco perfiles, checkout, pedido, reclamos, términos y acceso al admin. Todas respondieron 200, sin errores JavaScript ni desbordamiento horizontal.
- Portada, todas las capturas móviles y acceso al admin: imágenes idénticas. Algunas capturas de escritorio presentan entre 2 y 14 píxeles distintos; en la comprobación de Hotfix la diferencia máxima es 1/255 de color en el pie de página, sin cambios de geometría.
- Capturas y detalles de comparación locales: `output/redesign/cleanup-before/`, `cleanup-after/`, `cleanup-visual-diff.json`.
- Los archivos protegidos no aparecen en el diff. La revisión del admin cubre su acceso; no equivale a una prueba de todos sus flujos autenticados.
