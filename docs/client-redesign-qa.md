# Rediseño del cliente — implementación y QA

Rama: `redesign/client`. Base de comparación: `2f0c97c97586d638f6f1d13b10f20cc7562aaffc`.

## Alcance y commits

| Fase | Commit | Resultado |
| --- | --- | --- |
| 1 · Fundaciones | `eeef54c` | Tokens, Pouch y renders; sin cambio visual inicial. |
| 2 · Layout y landing | `faadd15` | Navegación, landing, Pipeline, tienda, origen, ritual, equipos, FAQ y footer. |
| 3 · Productos | `a21f24f` | Cinco rutas de producto, galerías, recetas y estados por revelar. |
| 4 · Compra | `0bc137d` | Carrito, checkout, búsqueda, seguimiento y presentación del pago. |
| 5 · Reclamos y políticas | `2064ae0` | Formularios, políticas, estados vacíos, 404 y adaptación móvil. |
| 6 · QA | Commit de este informe | Accesibilidad, optimización de fuentes/imágenes, revisión visual y contratos. |

`docs/redesign/`, `Claude outputs/` y `output/` están excluidos de Git. Los recursos utilizados por la web están en `src/assets/`.

## Verificaciones

- `npm run build`: correcto; sin warnings nuevos. El aviso original del bundle 3D deja de aparecer al retirar su montaje de la landing.
- `npm run typecheck`: correcto.
- `npm test`: 47 pruebas existentes aprobadas, en 10 archivos; no requieren BD.
- Playwright: capturas a 1440 y 390 px de landing, cinco perfiles, checkout, búsqueda de pedido, reclamos, tres políticas, 404 y acceso al admin. Sin desbordamiento horizontal ni errores JavaScript en las capturas revisadas.
- Compra con respuestas interceptadas: formato, molienda, agregar, cantidades, cotización, aceptación de políticas, contenido de `/api/orders` e inicio de `/api/payments/session` verificados. No se crearon pedidos reales.
- Reclamos con respuestas interceptadas: validación, datos del apoderado, queja/reclamo y contenido de `/api/complaints` verificados. No se enviaron reclamos reales.
- Búsqueda de pedido, galería, reservas, menú móvil, enlace para saltar al contenido y movimiento reducido comprobados.
- Los manejadores de compra, checkout, pago y reclamos conservan su contenido original; los cambios en React son de presentación.
- Ningún cambio en admin, API, servidor, middleware, esquema de BD, catálogo, tarifas, lógica de carrito ni analítica. Las escenas 3D originales se conservan.
- Capturas del acceso al admin idénticas píxel a píxel contra la versión original compilada, en ambos tamaños.

Las evidencias y las comparaciones visuales se conservan localmente en `output/redesign/`.

## Rendimiento y accesibilidad

- Lighthouse móvil: **92/100 de mediana de rendimiento** en tres pasadas (**92, 88, 93**); **100/100 de accesibilidad** en las tres.
- Condiciones: compilación de producción, navegador de QA ya iniciado, perfil móvil y limitación simulada predeterminados de Lighthouse, caché/almacenamiento reiniciados en cada pasada. Se reprodujo localmente la compresión Gzip ya configurada en Nginx, sin modificar Nginx ni el servidor de la aplicación.
- Se utilizó el catálogo de respaldo existente, sin una BD disponible. Esta medición no verifica un despliegue de producción ni el tiempo de respuesta de su BD.
- Las mediciones con un navegador recién lanzado fueron inferiores (68–77). El registro muestra esperas de GPU en ese arranque; se conservan también esos informes. El objetivo ≥ 90 se alcanza en la mediana descrita, no en todas las ejecuciones.
- Axe: **16 comprobaciones sin incidencias detectadas** (ocho páginas a 1440 y 390 px). Las pruebas automáticas complementan la revisión visual; no equivalen a una auditoría manual completa de accesibilidad.

Informes locales: `output/redesign/lighthouse-mobile-persistent-{1,2,3}.json`, `output/redesign/lighthouse-mobile-gzip.json` y `output/redesign/accessibility.json`.

## Diferencias intencionales frente a los ejemplos

- Prevalecen los datos confirmados: altitud 1 500–1 600 m s. n. m. y proceso lavado. No se añade una puntuación SCA sin confirmar.
- Los próximos productos usan bloques difuminados decorativos y el mensaje «Se revela en su lanzamiento». No se publica Lorem ipsum, precios ficticios ni fichas inventadas.
- «Avísame» queda deshabilitado: el endpoint existente de contacto abre WhatsApp y no registra suscripciones.
- Hotfix tiene cuatro vistas reales; el paquete no incluye una vista plana. No se genera una bolsa adicional.
- Pack Developer conserva su SKU, precio, moliendas e imágenes comerciales actuales; no se presenta Deploy como producto disponible dentro del pack.
- Los textos legales siguen saliendo de los settings existentes. Sin BD, las capturas muestran el estado vacío existente.
- RitualVideo se conserva en un desplegable. Los campos, opciones de compra y reserva existentes se mantienen aunque añadan contenido respecto del ejemplo visual.
- Las etiquetas pequeñas sobre crema se oscurecen a `#a84c28` para alcanzar contraste AA; se mantienen los tokens originales. El texto decorativo del footer se representa como SVG sin contenido accesible duplicado.
- Fuentes variables servidas localmente; tres tamaños WebP preparados por render. Se pueden regenerar con `node scripts/prepare-client-images.mjs`.

## Pendientes de aceptación

- **Compra integrada y pago Culqi en modo de prueba:** pendientes de un entorno con BD y pagos disponibles. Las pruebas locales interceptan las solicitudes de escritura.
- **Vistas autenticadas del admin:** no se dispone de una sesión de prueba. Se verificaron sus archivos y el acceso anónimo; no se afirma haber comparado cada pantalla privada.
- **Contenido legal publicado y tarifas vigentes de BD:** no pudieron contrastarse con una BD disponible. Se conserva la lectura original y se utiliza el catálogo/tarifario de respaldo solamente donde ya existía ese comportamiento.
