# Validación de publicación de productos (S6.7)

En `/admin/productos`, el botón **Activar** valida los datos guardados y muestra todos los requisitos pendientes en una lista accesible. Guarda primero los cambios del perfil. Solo los administradores pueden activar o descontinuar; los operadores conservan sus permisos de consulta y stock.

La activación requiere una línea asignada, frase, método de preparación, descripción, imagen principal y al menos una presentación activa. Todas las presentaciones activas deben tener un precio mayor que cero. Los textos vacíos o con espacios no cuentan como contenido.

La imagen principal es una entrada `front` de `product_media` con URL no vacía. La imagen única del modelo anterior (`products.image_url`) sigue contando durante la migración. Una imagen de reverso por sí sola no cumple el requisito.

`POST /api/admin/products/:id/status` recibe `{"status":"active"}` o `{"status":"discontinued"}`. Si faltan requisitos responde 409 con `error` e `issues`, una lista de `{code,message}`. Los códigos proceden del dominio `publicationIssues`, igual que sus mensajes. Los identificadores inválidos devuelven 400 y los productos inexistentes 404.

El endpoint de edición existente también pasa por la validación al guardar un producto habilitado para venta. Los cambios del perfil y de estado se confirman en una misma transacción, bloqueando el producto; un rechazo revierte el perfil. Reintentar una activación válida conserva su fecha de lanzamiento. Los productos nuevos se crean como borradores sin venta activa para que la creación no eluda los requisitos.

La descontinuación mantiene los datos del producto. Los productos legados sin estado conservan su ruta de edición para retirar el indicador antiguo de venta; volver a habilitarlos exige cumplir las reglas del catálogo. La edición completa de líneas, contenido editorial y otros estados corresponde a las historias posteriores del panel.

Pruebas: `tests/unit/publication-validation.test.ts` cubre cada requisito y sus mensajes; `tests/integration/publication-validation.test.ts` comprueba permisos, rechazo sin cambios, protección de la edición, imagen principal, activación, fecha estable y descontinuación sobre HTTP y PostgreSQL.
