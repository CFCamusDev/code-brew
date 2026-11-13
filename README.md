# CodeBrew — 1.5.2

Tienda en Astro con identidad de café de especialidad para programadores: **Buen café. Mejor código.** La landing con precios en vivo, los pedidos, las API y la administración se ejecutan en un servidor Node con PostgreSQL. Las rutas marcadas para prerenderizado se generan como HTML estático. Los componentes interactivos se escriben como islas React.

## Desarrollo

El proyecto usa **Node 22.23.4 o una versión compatible indicada en `engines`**, y **pnpm 10.30.3** (`corepack enable` si aún no lo tienes). Consulta `docs/releases/1.5.2.md` para este release y `docs/releases/1.1.0.md` para la configuración de producción.

- `pnpm install --frozen-lockfile`
- `cp .env.example .env`
- `pnpm db:up` levanta PostgreSQL de desarrollo en Docker (puerto 5434).
- `pnpm db:migrate` aplica las migraciones y `pnpm db:seed` carga el catálogo inicial.
- `pnpm dev` usa el puerto definido en `astro.config.mjs`.
- Puerto alternativo: `pnpm exec astro dev --host 127.0.0.1 --port 4321`.
- `pnpm build` genera `dist/client` (estático) y `dist/server` (servidor Node).
- `pnpm preview` sirve la compilación.
- `pnpm start` arranca el servidor de producción ya compilado; las variables deben estar exportadas en el entorno (Docker las inyecta).
- `pnpm exec tsc --noEmit` comprueba los módulos TypeScript.

## Base de datos

- Esquema en `src/lib/server/db/schema.ts` (Drizzle ORM). Montos en céntimos de sol.
- Tras cambiar el esquema: `pnpm db:generate` crea la migración SQL en `drizzle/`; se versiona en git.
- `src/data/catalog.json` es la fuente del catálogo inicial: la landing toma de ahí precios y moliendas, y el seed lo inserta en la base de datos sin pisar precios ni stock editados después.
- `src/data/shipping.json` define las zonas de envío iniciales (tarifas provisionales hasta confirmarlas).
- `pnpm db:studio` abre un explorador de la base de datos (útil para ajustar stock mientras no exista el admin).

## Tienda

- Carrito: `src/lib/shop/cart.ts` (nanostores, guardado en `localStorage`) y la isla `CartWidget` del header. Solo guarda sku, molienda y cantidad.
- `/checkout`: isla `CheckoutApp` con validación zod compartida con la API (`src/lib/shop/checkout.ts`).
- `POST /api/cart/quote` recalcula precios, stock y envío con la base de datos; `POST /api/orders` crea el pedido pendiente de pago. El servidor nunca usa precios enviados por el navegador.
- `/pedido/[id]`: resumen del pedido; el UUID funciona como enlace privado para compras como invitado.
- Una presentación con stock 0 no se puede comprar: carga el stock real antes de abrir la tienda.
- Envío gratis: por subtotal (`free_from_cents`) o por bolsas (`free_from_bags`; el Pack Developer cuenta 2). Hoy: desde 3 bolsas en Lima y Callao.

## Pagos (Culqi)

- Variables: `CULQI_PUBLIC_KEY`, `CULQI_SECRET_KEY` y `CULQI_WEBHOOK_SECRET` (ver `.env.example`). Sin llaves, la página del pedido ofrece coordinar el pago por WhatsApp.
- `/pedido/[id]` muestra **Pagar ahora** (isla `PayButton`): abre Culqi Checkout con tarjeta, Yape, billeteras, banca móvil y agentes.
- Tarjeta y Yape: `POST /api/payments/charge` cobra el total guardado del pedido. Si el banco exige 3DS (`action_code: REVIEW`), Culqi3DS autentica y se reintenta el cargo.
- PagoEfectivo, billeteras y agentes usan una orden de Culqi (`POST /api/payments/session`) y se confirman por webhook.
- Webhook: en CulqiPanel > Eventos > Webhook registra `order.status.changed` con la URL `https://<dominio>/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET>`. El servidor no confía en el cuerpo: vuelve a consultar la orden a Culqi.
- Al confirmarse un pago se descuenta el stock en la misma transacción; si no alcanza, el pedido queda con `stock_shortage` y se avisa al administrador. Confirmar dos veces el mismo pago no tiene efecto.
- Correos con Resend (`RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `SITE_URL`); sin API key solo se registran en los logs.
- Pruebas: tarjetas en https://docs.culqi.com/es/documentacion/pagos-online/tarjetas-de-prueba (Visa 4111 1111 1111 1111, 09/30, CVV 123).

## Panel de administración (`/admin`)

- Primer usuario: `pnpm admin:create correo@dominio.com "Nombre" admin` (en Docker: `docker exec -it codebrew-app node scripts/admin/create-user.mjs correo@dominio.com "Nombre" admin`). Imprime una contraseña temporal; se cambia en **Mi cuenta**. Repetir el comando con un correo existente restablece su contraseña.
- Roles: **operador** (pedidos, cambios de estado, stock y compras) y **administrador** (además precios, productos, envíos, reembolsos, borrar compras y usuarios).
- Inicio (`/admin`): ventas de hoy y del mes, pedidos por preparar y por despachar, pagados sin stock, pedidos sin pagar y stock bajo.
- Hoja de despacho imprimible (A5/A4) por pedido o en lote desde las colas "por preparar" y "por despachar" (`/admin/despacho?ids=…`).
- Exportación CSV para Excel de pedidos (con los filtros y fechas de la lista), compras del mes y movimientos de stock.
- Clientes (`/admin/clientes`): agrupados por correo, con total comprado, última compra, cafés favoritos y pedidos.
- Pedidos sin pagar se cancelan solos a las 48 h, salvo un código de PagoEfectivo o billetera vigente: tarea `POST /api/cron/pedidos-abandonados` con `Authorization: Bearer $CRON_SECRET`, llamada cada hora por el workflow *Tareas programadas* (secreto `CRON_SECRET` en GitHub, mismo valor que en la stack). Un administrador también puede ejecutarla desde el inicio.
- Pedidos: filtros por estado, búsqueda, detalle con pagos e historial; flujo pagado → en preparación → enviado (transportista y seguimiento, correo al cliente) → entregado. Reembolsos por Culqi con reposición de stock.
- Productos y stock: precios y disponibilidad se reflejan al instante en la landing; cada cambio de stock queda en `stock_movements`.
- Envíos: tarifa base por zona, envío gratis por bolsas o subtotal y tarifas por departamento.
- Compras y gastos por mes y categoría.
- Seguridad: contraseñas con scrypt, sesiones en cookie HttpOnly/SameSite=Lax (en BD solo el hash del token), límite de 5 intentos de login por IP y correo cada 15 minutos, acciones solo por JSON.

## Pruebas

- `pnpm typecheck`: tipos de todo el proyecto (incluidas las pruebas).
- `pnpm config:check`: valida la configuración local sin mostrar secretos ni contactar servicios externos. El contenedor ejecuta esta validación antes de migrar.
- `pnpm test:docker`: construye y levanta la stack completa con PostgreSQL desechable, espera a que esté saludable y ejecuta tipos, pruebas unitarias e integración a través de Nginx. Requiere Docker Compose 2.24.4 o posterior. No usa el `.env` local ni las llaves reales; elimina sus contenedores y volúmenes al terminar. `--keep` conserva la stack para diagnóstico.
- `pnpm test`: pruebas unitarias (`tests/unit`), sin base de datos.
- `pnpm test:integration`: pruebas por HTTP contra un servidor levantado (`tests/integration`). Necesitan `DATABASE_URL` y `INTEGRATION_BASE_URL`, y modifican datos (stock, precios, usuarios de prueba), así que usa una base aparte:

```bash
docker exec codebrew-db-dev psql -U codebrew -c "create database codebrew_test"
export DATABASE_URL=postgres://codebrew:codebrew@localhost:5434/codebrew_test
pnpm db:migrate && pnpm db:seed && pnpm build
CULQI_WEBHOOK_SECRET=ci-secreto PORT=4398 node dist/server/entry.mjs &   # sin llaves de Culqi ni Resend
INTEGRATION_BASE_URL=http://127.0.0.1:4398 CULQI_WEBHOOK_SECRET=ci-secreto pnpm test:integration
```

## CI / CD (GitHub Actions)

- **CI** (`.github/workflows/ci.yml`) corre en cada PR y en cada push a `main`, `develop` y `release/**` con tres verificaciones: *Tipos, pruebas unitarias y build*, *Pruebas de integración (PostgreSQL)* e *Imagen Docker*.
- **Deploy** (`.github/workflows/deploy.yml`): cuando el CI de `main` termina bien, llama al webhook de la stack de Portainer (secreto `PORTAINER_WEBHOOK_URL`) y espera a que `/api/health` responda en `SITE_URL` (variable del repo; por defecto `https://coffeecodebrew.com`). Sin el secreto no despliega. También se puede lanzar a mano desde *Actions*.
- **Protección de `main`** (la aplica quien administra el repo): exige las tres verificaciones del CI, una aprobación y conversaciones resueltas antes de fusionar.

```bash
gh api -X PUT repos/CFCamusDev/code-brew/branches/main/protection --input .github/branch-protection.json
```

## Producción (Docker / Portainer)

`docker-compose.yml` levanta tres servicios: `codebrew-landing` (Nginx público en `PORT`, gzip, cabeceras de seguridad y `limit_req` por IP en login, pedidos, pagos, consulta de pedido y contacto; superar el límite devuelve 429 sin llegar a la app), `codebrew-app` (servidor Astro) y `codebrew-db` (PostgreSQL con volumen persistente). Requiere definir `POSTGRES_PASSWORD` en las variables de la stack. Al arrancar, la app aplica migraciones pendientes y carga el catálogo que falte. `GET /api/health` indica si la app y la base de datos responden.

## Cliente actual

La portada presenta la línea Pipeline. Hotfix permite elegir presentación y molienda desde `/producto/hotfix`; Cold Start, Deploy, Merge y Rollback tienen sus páginas de próximos lanzamientos. El carrito, checkout, pedidos, reclamos y políticas conservan sus contratos existentes.

- `src/pages/index.astro`: composición de la portada.
- `src/components/Hero.astro` y `Pipeline.astro`: entrada al catálogo.
- `src/components/ProductProfile.astro` y `ProductPurchase.astro`: galería, selector de perfiles y compra.
- `src/components/Pouch.astro`: renders optimizados y tamaños responsivos.
- `src/data/pipeline.ts`: contenido y estado visual de los cinco perfiles.
- `src/styles/brand.css`: estilos del cliente; `shop.css`: flujo de compra.
- `src/data/config.ts`: configuración compartida; no sustituye precios y stock en vivo.

Las imágenes originales de `src/assets/pipeline/` alimentan `node scripts/prepare-client-images.mjs`. Las variantes de `optimized/` se cargan mediante un glob y nombres construidos en `Pouch.astro`; no son archivos huérfanos.

La experiencia 3D está reservada para retomarla: se conservan `CoffeeExperience3D.astro`, `WorldStage.astro`, `Experience.astro`, los módulos de `src/scripts/`, sus texturas y el respaldo `src/assets/demo/monteverde.png`. No se montan en la portada actual. Las dependencias Three.js y GSAP siguen siendo necesarias para ese código reservado.

Se retiraron los componentes anteriores sin importaciones, la antigua sección Tienda, sus estilos exclusivos y cinco imágenes sin uso. Las imágenes que todavía importa la configuración compartida se conservan. La limpieza no modifica el admin, backend, BD ni catálogo comercial.
