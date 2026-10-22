# CodeBrew — immersive prototype

Web estática en Astro con identidad de café de especialidad para programadores: **Buen café. Mejor código.**

## Desarrollo

- `npm install`
- `npm run dev` usa el puerto definido en `astro.config.mjs`.
- Puerto alternativo: `node node_modules/astro/astro.js dev --host 127.0.0.1 --port 4321`.
- `npm run build` genera `dist/`.
- `npm run preview` sirve la compilación.
- `node node_modules/typescript/bin/tsc --noEmit` comprueba los módulos TypeScript.

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
