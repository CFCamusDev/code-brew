# Tema y plantilla de una línea

Cada línea de productos tiene identidad propia ([ADR 0004](adr/0004-identidad-visual-por-linea.md)). La guardan dos columnas de `product_lines`:

| Columna | Qué es | Quién la cambia |
|---|---|---|
| `theme` | Variables CSS (`{"--cb-terracotta-bright": "#e58a5f"}`) | Datos: panel o base |
| `template` | Nombre de una plantilla registrada en `src/lines/registry.ts` | Datos (elegir entre las registradas); la plantilla en sí es código revisado por PR |

La portada pinta la sección de la línea, `/producto/[slug]` la página del producto y `/tienda` la tarjeta de cada producto, todo con la plantilla de su línea. Las tres leen el catálogo con `src/features/catalog/page-catalog.ts` (`CATALOG_SOURCE=db`).

## Tema

El tema se aplica como `style` en el contenedor de la línea: la sección de la portada y el `.cb-product` de la página de producto. Así, cualquier variable que use la plantilla dentro de ese contenedor toma el valor de la línea.

Variables útiles con las plantillas actuales:

| Variable | Dónde se nota |
|---|---|
| `--cb-forest-950` | Fondo de las secciones oscuras (`.cb-dark`, la sección del Pipeline) |
| `--cb-terracotta-bright` | Acentos, botón principal y etiquetas sobre fondo oscuro |
| `--cb-terracotta-deep` | Palabras destacadas (`em`) sobre fondo claro |
| `--cb-cream`, `--cb-cream-2` | Texto sobre oscuro y fondo de tarjetas |
| `--pl-<slug>-tint` | Color de cada perfil en la grilla del Pipeline |

`src/lines/theme.ts` solo deja pasar nombres `--letras-y-guiones` y valores de color, medida o tipografía (`#hex`, `rgb()`, `hsl()`, `var()`, números y `%`). Descarta `url()`, `image()`, `expression()` y cualquier `;`, `:`, llave o comilla, para que un tema no pueda romper la página ni cargar recursos. Un tema vacío (`{}`) deja los colores de `brand.css`.

Ejemplo, para probar en local:

```sql
update product_lines set theme = '{"--cb-terracotta-bright": "#7fd6a0", "--cb-forest-950": "#0d1b2a"}' where slug = 'pipeline';
```

## Plantilla

Una plantilla aporta tres componentes con estas props (los tipos están en `page-catalog.ts`):

- `LineSection`: `{ line: CatalogLine; products: CatalogProfile[] }`. Es la sección de la línea en la portada.
- `ProductPage`: `{ line: CatalogLine; product: CatalogProfile; offer: CatalogOffer; siblings: CatalogProfile[] }`. Es el contenido de `/producto/[slug]`.
- `ProductCard`: `{ line: CatalogLine; item: StoreItem }`. Es la tarjeta del producto o pack en `/tienda`. Lo más simple es reutilizar la de `base` y reemplazar solo la imagen con el slot `visual`, como hace Pipeline con su bolsa.

Si una línea no tiene plantilla, o tiene un nombre que no está registrado, se usa `base`. Esa plantilla muestra las imágenes de `product_media`, solo las secciones con contenido y la compra (`ProductPurchase`).

### Agregar una plantilla nueva

1. Crea `src/lines/<nombre>/LineSection.astro`, `ProductPage.astro` y `ProductCard.astro` con las props de arriba. Parte de `src/lines/base/` y deja dentro de esa carpeta las piezas propias de la línea, como `Pouch` en Pipeline.
2. Aplica el tema en el contenedor: `style={themeStyle(line.theme) || undefined}`. Si ya tiene estilos propios, únelos con `joinStyles(...)`.
3. Usa `ProductPurchase` para comprar. Así el carrito, la reserva por WhatsApp y la analítica funcionan igual en todas las líneas.
4. Regístrala: agrega `'<nombre>'` a `TEMPLATE_NAMES` en `src/lines/registry.ts` y sus componentes en los despachadores `src/lines/LineSection.astro`, `src/lines/ProductPage.astro` y `src/lines/ProductCard.astro`. `tests/unit/lines.test.ts` falla si una plantilla registrada no está en los tres despachadores.
5. Asígnala a la línea (`update product_lines set template = '<nombre>' where slug = '…'`, o desde el panel cuando lo permita).
6. Agrega capturas a 1440 px y 390 px al PR. Si la plantilla carga JS, revisa que `pnpm perf:budget` siga en verde.

Lo que no va en una plantilla: precios, stock o reglas de qué se muestra. Eso lo decide el módulo `catalog` (solo lo publicado y lo revelado) y llega ya resuelto en las props.
