# CodeBrew — immersive prototype

Web en Astro con identidad de café de especialidad para programadores: **Buen café. Mejor código.** La landing se prerenderiza como HTML estático; las rutas de API, checkout y administración se ejecutan en un servidor Node con PostgreSQL. Los componentes interactivos se escriben como islas React.

## Desarrollo

El proyecto usa **pnpm** (`corepack enable` si aún no lo tienes).

- `pnpm install`
- `cp .env.example .env`
- `pnpm db:up` levanta PostgreSQL de desarrollo en Docker (puerto 5434).
- `pnpm db:migrate` aplica las migraciones y `pnpm db:seed` carga el catálogo inicial.
- `pnpm dev` usa el puerto definido en `astro.config.mjs`.
- Puerto alternativo: `pnpm exec astro dev --host 127.0.0.1 --port 4321`.
- `pnpm build` genera `dist/client` (estático) y `dist/server` (servidor Node).
- `pnpm preview` sirve la compilación.
- `pnpm exec tsc --noEmit` comprueba los módulos TypeScript.

## Base de datos

- Esquema en `src/lib/server/db/schema.ts` (Drizzle ORM). Montos en céntimos de sol.
- Tras cambiar el esquema: `pnpm db:generate` crea la migración SQL en `drizzle/`; se versiona en git.
- `src/data/catalog.json` es la fuente del catálogo inicial: la landing toma de ahí precios y moliendas, y el seed lo inserta en la base de datos sin pisar precios ni stock editados después.
- `pnpm db:studio` abre un explorador de la base de datos.

## Producción (Docker / Portainer)

`docker-compose.yml` levanta tres servicios: `codebrew-landing` (Nginx público en `PORT`, gzip y cabeceras de seguridad), `codebrew-app` (servidor Astro) y `codebrew-db` (PostgreSQL con volumen persistente). Requiere definir `POSTGRES_PASSWORD` en las variables de la stack. Al arrancar, la app aplica migraciones pendientes y carga el catálogo que falte. `GET /api/health` indica si la app y la base de datos responden.

## Experiencia

- Portada con bolsa y granos 3D, respuesta al cursor y rotación vinculada al scroll.
- Selector de cuatro perfiles con PNG transparentes, transiciones GSAP, formato, molienda y precio.
- Relieve interpretativo del origen, taza y pack para equipos modelados con geometría procedural Three.js.
- Un renderizador WebGL compartido; viewport y scissor delimitan cada escena a su sección.
- Animaciones de entrada y progreso de lectura con GSAP / ScrollTrigger.
- Botón de pausa que conserva la escena, posición de lectura y selección de producto.
- Desplazamiento nativo, encuadres móviles, resolución limitada y renderizado detenido cuando las escenas no son visibles o la pestaña está oculta.
- `prefers-reduced-motion` muestra escenas estáticas. Si WebGL falla o pierde el contexto, queda visible la imagen de respaldo.

## Archivos principales

- `src/pages/index.astro`: narrativa y composición.
- `src/components/Hero.astro`: capítulo de portada.
- `src/components/Products.astro`: perfiles, selector y pedidos.
- `src/components/WorldStage.astro`: zonas visuales y respaldo accesible.
- `src/components/Experience.astro`: scroll, transiciones y control de pausa.
- `src/scripts/worlds.ts`: modelos, iluminación, renderizado y liberación de recursos.
- `src/styles/global.css`: sistema visual y adaptación.
- `src/data/config.ts`: precios originales y número de WhatsApp.

## Imágenes de muestra y sustitución

Los tres originales generados con transparencia real están en `src/assets/demo/`: `monteverde.png`, `espresso.png` y `microlote.png`. Astro produce WebP transparentes optimizados y miniaturas para su uso en la página. El Pack Developer combina las dos primeras bolsas.

Los empaques son **conceptuales**, no fotografías del producto definitivo. La página lo indica junto al selector. Para reemplazarlos, cambia estos PNG manteniendo encuadre vertical, transparencia y proporciones semejantes, o actualiza sus importaciones en `Products.astro` y `WorldStage.astro`.

La bolsa 3D tiene una etiqueta generada en `packageTexture()` dentro de `worlds.ts`. Al disponer del packaging real, actualizar esa textura y, si se requiere fidelidad fotográfica de pliegues y materiales, sustituir el modelo procedural por un GLB del producto. El terreno es una interpretación gráfica, no cartografía real.

Stock, pago y envío se coordinan por WhatsApp. La web no procesa pagos. La integración GA4 anterior se mantiene solo en producción. No se ha desplegado esta reconstrucción en hosting.

Los componentes antiguos no importados permanecen como referencia y no forman parte de la página activa.
