# Changelog

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
