# Recursos de marca

## Hotfix en el selector de café (2026-10-27)

`hotfix-daily-driver.webp` procede de `image-gen-5.png`, aportado por el usuario: perspectiva frontal con el lateral izquierdo verde visible. Optimizado a WebP de 1000 px de ancho manteniendo la transparencia y el diseño original. Las otras tres perspectivas se usaron como referencia para transcribir origen, proceso, tueste, variedades y preparación.

Hotfix sustituye a Monteverde en el primer perfil del selector. Se conservan los SKU históricos `monteverde-250` y `monteverde-500`; la migración 0006 actualiza únicamente el nombre, tueste y moliendas del producto, sin modificar precios, stock ni pedidos anteriores. El Dúo conserva sus imágenes actuales.

Recursos aportados por el usuario desde Google Drive el 23 de octubre de 2026.

- codebrew-cup.webp: https://drive.google.com/file/d/1-1YKNlQRVJz4JPeFxZzzkR78vN_J0Ppc/view. Original negro con transparencia, reducido a 192 px.
- codebrew-cup-light.webp: https://drive.google.com/file/d/1M7U01teMrBMlnSj47p_CcbOwsrtf9YQ9/view. Original claro con transparencia, reducido a 192 px.

Los archivos optimizados están en public/assets/brand/. El diseño Hotfix se aplica a la bolsa de la portada; no modifica el catálogo de productos.

Nota (2026-10-23): las texturas hotfix-front/back/side.webp (fondo verde oscuro) se reemplazaron por
texturas generadas por canvas en `src/scripts/worlds.ts` (mismo mecanismo que Monteverde/Espresso),
con cuerpo crema y etiqueta verde redondeada, para que coincida con el resto de la línea de producto.

Actualización: las cuatro caras Hotfix ahora usan los PNG originales 1-Hotfix-Stable-frente, 2-Hotfix-Stable-reverso, 3-Hotfix-Stable-lateral-izquierdo y 4-Hotfix-Stable-lateral-derecho aportados por el usuario. Se optimizaron a WebP (2048 px de alto, calidad 95) en public/assets/brand/hotfix-stable-*.webp. No se recrearon textos ni logos. Sustituyen las texturas de canvas de Hotfix; las otras variedades conservan su presentación.

## Cappuccino cup
Created with the built-in image_gen tool from the user-provided cup reference (2026-10-23). Original: cappuccino-cup.png; website: public/assets/brand/cappuccino-cup.webp, transparent WebP 1100px.
Prompt: Photorealistic cutout of the reference matte olive forest-green ceramic cup and matching saucer, cream steaming cup logo with </> on the front. No cat. Filled with cappuccino, ivory milk foam, rosetta latte art and caramel crema. Three-quarter view from above, handle right, complete cup and saucer centered with margin. Soft studio lighting, genuine transparent background, no additional objects, text or watermark.

## Video del ritual (método V60)
Video aportado por el usuario (metodov60_limpio.mp4, 2026-10-28). Se recomprimió en H.264 sin audio (CRF 24, faststart) a public/assets/brand/ritual-v60.mp4; la imagen de espera ritual-v60-poster.jpg es el fotograma del segundo 19,5. Reemplaza al video de la taza (ritual-orbit.mp4).
