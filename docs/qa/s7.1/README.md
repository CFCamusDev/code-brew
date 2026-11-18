# S7.1 — Backend de interesados

Issue: [#114](https://github.com/CFCamusDev/code-brew/issues/114). Verificación local del 17 de noviembre de 2026.

- Revisados los PR abiertos antes de generar la migración: el PR #172 no modifica esquema ni migraciones. La migración nueva solo crea la tabla de interesados y sus restricciones e índices.
- Tipos, arquitectura, 336 pruebas unitarias, build y auditoría con la excepción existente del proyecto. No se añadieron dependencias.
- `pnpm test:docker` correcto: build, salud de PostgreSQL/app/Nginx, migraciones, 336 pruebas unitarias y 116 de integración aprobadas. Diez pruebas se omiten por la configuración de pasarela del stack; el CI también configura FakeGateway.
- Pruebas HTTP/PostgreSQL de consentimiento, correo normalizado, cinco solicitudes simultáneas sin duplicados, conservación de fechas, mismo correo en productos distintos y restricciones de la base.
- Rechazo uniforme de productos inexistentes, borradores, activos, descontinuados o con línea archivada. GET no devuelve suscriptores.
- Límite de intentos probado con respuesta 429 y Retry-After; tamaño limitado también para cuerpos sin Content-Length.
- Comprobación adicional contra `localhost:8080` y el Node real del contenedor: alta y duplicado 200, consentimiento inválido 400, producto no elegible 404, cuerpo grande sin longitud 413, lectura 405 y una sola fila normalizada.
- El producto, línea y suscripción de la comprobación local se eliminaron al terminar. No se enviaron correos ni mensajes.

No hay cambios visuales: el formulario de suscripción pertenece a S7.2.
