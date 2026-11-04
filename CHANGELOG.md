# Changelog

## 1.6.0

- Acceso flotante a WhatsApp Business en las páginas públicas, con icono compacto en móvil y etiqueta de ayuda en escritorio.
- Mensajes adaptados a consultas generales, asistencia en checkout y seguimiento de pedidos, sin incluir datos personales.
- El destino se resuelve con la configuración vigente al hacer clic, también en páginas prerenderizadas.
- Número de contacto predeterminado e inicial actualizado a +51 946 848 984. En instalaciones existentes, actualizar el número guardado desde Administración > Configuración.
- El botón se oculta al abrir diálogos y durante la entrada de formularios en móvil; el control de animaciones se sitúa a la izquierda.
- Se conserva el footer sin espacio adicional debajo y se añaden pruebas del acceso y la configuración de WhatsApp.

## 1.5.2

- Los próximos perfiles de Pipeline se presentan como «Muy pronto», con siluetas genéricas difuminadas, sin revelar nombres, imágenes reales, descripciones, precios ni opciones de compra.
- Hotfix conserva su ficha, giro de empaque y flujos de compra y reserva.
- Preguntas frecuentes y sección para equipos ajustadas a la presentación actual de Hotfix.
- Perfil de TikTok actualizado a `@coffecodebrew` en los enlaces, valores de respaldo y configuración inicial.
- Migración 0010 para sustituir el enlace anterior de TikTok en la configuración existente sin alterar otras redes ni enlaces personalizados distintos.

## 1.5.1

- El botón "Reservar mi café" (presentaciones sin stock) ahora usa el número de WhatsApp configurado en `/admin/configuracion` en vez del número fijo en el código.
- Cuando el stock se agota entre crear el pedido y pagarlo, `/pedido/[id]` muestra qué producto quedó corto y deja ajustar la cantidad o quitarlo ahí mismo, sin recargar la página, para reintentar el pago.

## 1.5.0

- Libro de Reclamaciones virtual (`/reclamos`), obligatorio por Indecopi: formulario público con los campos de la hoja oficial, numeración correlativa por año (2026-0001...), copia por correo al consumidor y aviso al negocio. Panel admin con lista por estado, plazo de respuesta de 30 días y registro de la respuesta.
- Políticas legales editables desde el panel (`/politicas/terminos`, `/politicas/privacidad`, `/politicas/envios-devoluciones`), con casilla obligatoria de aceptación en el checkout.
- Redes sociales (Instagram, TikTok, Facebook) y número de WhatsApp Business editables desde `/admin/configuracion`, en vez de estar fijos en el código.
- Alta de productos y presentaciones desde `/admin/productos`, con subida de imágenes a Cloudinary.

## 1.4.0

- Video de preparación con método V60 en la sección del ritual: se repite de forma continua, ocupa toda la tarjeta y la etiqueta pasa a `// specialty coffee`. Reemplaza al video de la taza.
- Enlaces e iconos de Instagram (@codebrewc) y TikTok (@codebrew1) en el pie de página.

## 1.3.0

- Flecha en forma de gota de vidrio para girar la bolsa Hotfix y ver su otro lateral; vuelve al frente al pulsarla de nuevo o al cambiar de café.
- Reserva por WhatsApp para las presentaciones sin stock: nota «Nuevo lote en camino» y formulario que arma el mensaje con los datos del cliente.

## 1.2.0

- Hotfix sustituye a Monteverde en el primer perfil del selector de café.
- Nuevo empaque con lateral verde, miniatura y ficha de origen basados en los recursos aportados.
- Catálogo, carrito y preguntas frecuentes actualizados con el nombre Hotfix, tueste medio-oscuro y moliendas compatibles.
- Migración 0006 para actualizar el producto existente conservando SKU, precios, stock y pedidos anteriores.

## 1.1.0

- Nueva presentación editorial de la tienda, sección para equipos y video del ritual.
- Healthchecks de aplicación y proxy; Nginx espera a que app y PostgreSQL estén listos.
- Resolución DNS dinámica para recuperar el proxy cuando cambia la IP de la app al redesplegar.
- Validación de configuración antes de migrar y webhook desactivado si falta su secreto.
- Versión publicada en `/api/health` y respuesta sin caché.
- Pruebas reproducibles de la stack Docker con datos desechables, recursos de la landing, video por rangos y renderizado del panel.
- CI ejecuta la stack completa además de los controles de calidad.

## 1.0.0

- Primera versión 1.x: tienda, checkout, pedidos, pagos Culqi y seguimiento.
- Administración de catálogo, inventario, envíos, usuarios y métricas.
- GA4 condicionado al entorno de producción.
- Preparación del release con dependencias fijadas, actualizaciones de seguridad, runtime reproducible y guía de despliegue.
- Ejemplo de entorno con pagos desactivados por defecto y exclusión de archivos de secretos del repositorio y del contexto Docker.
