# Productos próximos y campos revelados (S5.8)

Los productos `upcoming` muestran solo el contenido autorizado por `product_profiles.revealed_fields`. El dominio `revealProfile` filtra los campos antes de construir la API pública y las páginas: el contenido privado nunca se envía al HTML para difuminarlo.

Las plantillas `pipeline` y `base` comparten `ProductDetails` y `RevealField`. Cada campo con contenido público se muestra aunque el producto siga próximo. Los campos pendientes tienen marcadores vacíos decorativos con `aria-hidden="true"` y una explicación visible y accesible. El aviso general aparece cuando aún faltan detalles. Los productos activos muestran todo su contenido editorial y no reciben marcadores de lanzamiento por campos vacíos.

Campos admitidos: `tagline`, `method`, `description`, `notes`, `facts`, `cupProfile` y `recipe`. `recipeFor` acompaña a `recipe`. Precios y presentaciones siguen reservados a los productos activos; revelar contenido editorial no habilita su compra. La receta y la trazabilidad usan el contenido público disponible, sin exigir que el producto esté activo.

Con `CATALOG_SOURCE=db`, cambiar `revealed_fields` se refleja en la siguiente petición al servidor, sin recompilar ni desplegar. Los clientes de la API pueden observar el TTL de sus cabeceras de caché. El fallback estático de Pipeline conserva únicamente frase, método y receta en productos próximos; sus datos pendientes se retiran antes de entregarlos a las plantillas.

Las pruebas unitarias renderizan `RevealField` con Astro Container y comprueban que no emite el contenido del slot oculto. Las pruebas de integración cambian PostgreSQL y vuelven a consultar HTML y API en ambas plantillas; comprueban revelado parcial, campos privados ausentes y paso a activo, restaurando los datos originales al terminar.
