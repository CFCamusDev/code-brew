# Changelog

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
