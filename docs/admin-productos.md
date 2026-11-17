# Administración de productos por línea (S6.2)

En `/admin/productos`, un administrador puede crear un producto dentro de una línea y editar su nombre, frase mínima, estado, número de entrega y fecha de lanzamiento. El slug se genera al crear y se conserva al cambiar el nombre. Los operadores mantienen acceso de consulta y sus permisos existentes de stock.

Para anunciar un producto como **Próximamente** se requiere línea y frase. El editor de contenido completo y los campos revelados pertenecen a S6.3; aquí solo se incorpora la frase necesaria para anunciar. Los productos nuevos con frase la muestran antes del lanzamiento. Editar esa frase conserva el resto del perfil y su selección de campos revelados.

La creación permite borrador o próximo desde el formulario. En la edición pueden solicitarse los cuatro estados; el servidor aplica las transiciones del dominio y devuelve los requisitos de publicación o el motivo de una transición inválida. La activación sigue exigiendo contenido, imagen principal y presentación con precio, según S6.7.

La fecha se introduce en hora de Perú y la API la guarda como un instante con zona horaria. Es una fecha prevista informativa, no un programador de publicaciones. Después de activar o descontinuar se conserva la fecha del primer lanzamiento. El número de entrega debe ser un entero positivo y no puede repetirse dentro de la misma línea; ambos campos son opcionales.

**Vista previa** abre `/admin/productos/preview?slug=...` con los datos guardados. Requiere sesión, responde con `Cache-Control: no-store` y lleva `noindex`. No cambia el estado ni publica el borrador. Los productos no activos se previsualizan con la misma selección de contenido de un próximo lanzamiento. Los activos muestran su vista pública completa. Un producto sin línea aún no tiene vista previa.

Los productos nuevos de Pipeline pueden no tener renders de bolsa registrados: la portada usa un marcador de imagen y la página individual usa la plantilla base, que admite imágenes del catálogo. Las tarjetas de tienda conservan su implementación de S5.6. La portada muestra el número de perfiles y de entrega a partir del catálogo.

## API y consistencia

- `POST /api/admin/products`: acepta los campos originales más `lineId`, `tagline`, `status`, `releaseNumber` y `launchAt`. Los clientes antiguos conservan el alta como borrador sin línea.
- `POST /api/admin/products/:id`: acepta los detalles originales con `active` para compatibilidad, o los metadatos completos con `status`. Los dos formatos son estrictos y no se pueden mezclar.
- `POST /api/admin/products/:id/status`: acepta `draft`, `upcoming`, `active` y `discontinued`, respetando las transiciones existentes.

El alta y la edición guardan producto, frase y estado en una transacción. La edición bloquea el producto; la línea seleccionada se comprueba bajo bloqueo compartido. Una línea inexistente devuelve 404; un número repetido o una transición rechazada devuelve 409 y no deja cambios parciales. No se añadieron migraciones ni se editaron las existentes.
