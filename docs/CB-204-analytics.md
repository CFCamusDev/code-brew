# CB-204 · Analítica de ventas (Brayni)

Implementación local. No desplegada ni verificada aún en GA4 DebugView.

## Eventos

- `view_item`: ficha visible (40% del panel), cambio de producto o presentación.
- `add_to_cart`: solo cantidades efectivamente añadidas; respeta el límite del carrito. El botón usa el precio mostrado del catálogo en vivo.
- `begin_checkout`: primera cotización válida y no vacía de la pantalla de checkout.
- `add_shipping_info`: envío del formulario validado, con la modalidad de entrega; no se envían campos del cliente.
- `purchase`: pantalla de pedido con estado confirmado por servidor (`paid`, `preparing`, `shipped`, `delivered`). Nunca pedido pendiente, cancelado o reembolsado. Usa número CB, SKU, cantidades, precios y total guardados en base de datos. La confirmación de Culqi ya recarga esta pantalla.

`src/lib/analytics.ts` proporciona `track()` para scripts e islas. Solo se construyen parámetros permitidos: moneda PEN, importes, SKU, nombre de catálogo, cantidades, modalidad de envío y número de transacción. No pasar objetos de cliente a este helper.

Se eliminó el evento antiguo que enviaba la URL completa de WhatsApp. Se omiten query, fragmentos, referencias y tokens de pedido de page_location; el título se normaliza. UTM acepta etiquetas alfanuméricas con guion, nunca correos, teléfonos o nombres de clientes. No usar datos personales en etiquetas de campaña.

## Producción y Docker

En el entorno de BUILD del despliegue real:

    PUBLIC_ANALYTICS_ENV=production
    PUBLIC_GA4_ID=G-YMMJ7V30SZ

Confirmar que ese ID (ya existente en el proyecto) corresponde a la propiedad del negocio. Desarrollo, localhost, administración y previews con `PUBLIC_ANALYTICS_ENV=disabled` no cargan Google ni envían eventos. Docker Compose pasa estas variables como argumentos de build; cambiar solamente el entorno del contenedor ya construido no sirve. Reconstruir cuando se autorice el despliegue. No se han modificado servicios ni publicado cambios en esta tarea.

En el flujo web de GA4 desactivar medición mejorada de formularios, clics salientes, búsquedas y cambios automáticos de historial; desactivar recogida de datos aportados por usuarios. Así se evita que la configuración remota recoja datos fuera de la lista controlada por el helper. Este ajuste requiere acceso a Analytics y queda pendiente.

## Instagram: enlaces de campaña

Sustituir el dominio si producción usa otro. No usar acentos ni espacios en etiquetas.

- Bio: https://coffeecodebrew.com/?utm_source=instagram&utm_medium=social&utm_campaign=hotfix_launch&utm_content=bio#productos
- Story: https://coffeecodebrew.com/?utm_source=instagram&utm_medium=social&utm_campaign=hotfix_launch&utm_content=story_01#productos
- Anuncio: https://coffeecodebrew.com/?utm_source=instagram&utm_medium=paid_social&utm_campaign=hotfix_launch&utm_content=reel_01#productos

Se pasan campaign_source, campaign_medium, campaign_name y campaign_content al configurar GA4; sus cookies mantienen la atribución durante el recorrido. Comparar campañas en Adquisición de tráfico y crear una exploración de embudo con los cinco eventos, en ese orden.

## Verificación pendiente en DebugView

1. Activar producción y confirmar el ID. Revisar ajustes de privacidad del flujo web indicados arriba.
2. Solo en el navegador de prueba, ejecutar `sessionStorage.setItem('codebrew:ga-debug','1')` y recargar. No activa analítica en desarrollo.
3. Abrir el enlace de Instagram. En Administrar → DebugView, verificar los cinco eventos recorriendo una compra autorizada.
4. Comparar transaction_id con el número del pedido y value con totalCents / 100 de servidor. Revisar shipping e items. No contar un pedido pendiente como venta.
5. Recargar y abrir otra pestaña del mismo pedido pagado: no debe reenviarse purchase. Comprobar también un segundo pedido distinto.
6. Inspeccionar parámetros y solicitudes: ningún correo, celular, dirección, nombre del comprador, texto de WhatsApp ni token de pedido.
7. Ejecutar `sessionStorage.removeItem('codebrew:ga-debug')` y recargar. Guardar evidencia en el ticket: fecha, propiedad, capturas de eventos y comprobación de recarga sin datos personales.

La protección combina marca persistente por pedido en localStorage, memoria, bloqueo entre pestañas cuando el navegador soporta Web Locks y transaction_id estable para la deduplicación de GA4. Si se borra o bloquea el almacenamiento, el cliente no puede garantizar una única emisión entre recargas; el mismo transaction_id sigue siendo la protección en GA4. Un bloqueador de anuncios puede impedir la entrega. Pagos offline cuyo comprador nunca vuelve a la página no se envían; medirlos requiere integración de servidor aparte.

Según la aceptación del ticket, `value` contiene el total final del servidor, incluido envío, y `shipping` se informa aparte. GA4 recomienda excluir envío e impuestos de value para ingresos de productos: decidir con el negocio si cambiar el criterio antes de comparar métricas de ingresos.

Referencias: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce y https://developers.google.com/analytics/devguides/collection/ga4/set-up-ecommerce
