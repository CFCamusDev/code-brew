# Entorno local y webhook de Culqi

Hay dos formas de correr CodeBrew en local. Elige según lo que vayas a probar.

| | `pnpm dev` | `pnpm local:up` |
|---|---|---|
| Para qué | Programar: recarga al guardar | Probar como en producción: pagos, webhook, Nginx |
| Qué levanta | Solo PostgreSQL en Docker (`pnpm db:up`); la app corre con Vite | Nginx + app + PostgreSQL con el mismo `docker-compose.yml` de producción |
| Dirección | http://localhost | http://localhost:8080 |
| Base de datos | `codebrew-db-dev` (puerto 5434) | Propia del stack (volumen `codebrew-local_codebrew-db-data`) |
| Webhook de Culqi | No: Vite rechaza dominios externos | Sí, con `--tunnel` |

## Stack local completo

```bash
pnpm local:up            # construye y levanta; la primera vez tarda unos minutos
pnpm local:up --tunnel   # además abre un túnel público para el webhook
pnpm local:url           # vuelve a mostrar la dirección del túnel
pnpm local:logs codebrew-app
pnpm local:down          # apaga; con --volumes borra también su base de datos
```

El script (`scripts/local-stack.mjs`) lee tu `.env` y completa lo propio de local:
- `APP_ENV=local` y `SITE_URL=http://localhost:8080`;
- una contraseña de PostgreSQL solo para este stack;
- la analítica desactivada.

Al arrancar, igual que en producción, el contenedor valida la configuración (`config:check`), aplica las migraciones y corre el seed. Para el panel crea tu usuario dentro del contenedor:

```bash
docker exec -it codebrew-local-app node scripts/admin/create-user.mjs tu@correo.com "Tu nombre" admin
```

## Webhook de Culqi en local

Culqi solo avisa por webhook los pagos que se completan **después**: PagoEfectivo, agentes y bodegas, banca móvil y billeteras, que usan una orden `ord_…` con código CIP. **Tarjeta y Yape no usan el webhook:** se cobran al instante y la tienda confirma el pedido en la misma respuesta.

1. En `.env`:
   - las llaves de prueba (`pk_test_…`, `sk_test_…`) **del mismo panel** donde vas a registrar el webhook;
   - `CULQI_WEBHOOK_SECRET` con 32 caracteres aleatorios o más, para generarlo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Levanta el stack con el túnel: `pnpm local:up --tunnel`. Muestra una dirección `https://….trycloudflare.com`.
3. En **CulqiPanel (panel de prueba) → Desarrollo → Webhooks → Crear Webhook**:
   - **Producto:** CulqiOnline
   - **Recurso:** Orden
   - **Acción:** cambio de estado (`order.status.changed`)
   - **Resultado:** todos, o al menos pagado y expirado
   - **URL:** `https://<túnel>/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET>`
4. Haz un pedido en http://localhost:8080, pulsa **Pagar** y elige **Agentes y bodegas**. La página del pedido muestra el CIP.
5. En un par de minutos, **Webhooks → Historial** muestra el aviso con **200 OK**.

### Qué esperar y problemas comunes

- **El aviso tarda:** suele llegar uno o dos minutos después de que cambia la orden.
- **El pedido sigue pendiente después del aviso:** es correcto mientras el CIP no se pague. La tienda no confía en el cuerpo del aviso: vuelve a consultar la orden a Culqi y actúa según su estado real.
- **El sandbox no permite simular el pago de un CIP.** Lo que sí se ve en local es el aviso de código generado y, al vencer el CIP, el de expirado. Para el pago, una prueba real de bajo monto en producción (#127).
- **404 en el Historial:** casi siempre es la URL de un túnel anterior. El túnel rápido cambia de dirección cada vez que se reinicia, así que hay que editar la URL en CulqiPanel.
- **401:** la clave de la URL no coincide con `CULQI_WEBHOOK_SECRET`.
- **El Historial o las Ventas aparecen vacíos:** cierra sesión en CulqiPanel y vuelve a entrar; la sesión vence sin avisar. En **Ventas**, revisa que arriba esté seleccionado **CulqiOnline**.
- **La orden no aparece en tu panel:** las llaves del `.env` son de otra cuenta de Culqi.

### Dirección fija con un túnel con nombre

Para no editar la URL en Culqi cada vez, se puede usar una dirección fija, por ejemplo `webhook-dev.coffeecodebrew.com`. Requiere acceso a la cuenta de Cloudflare de `coffeecodebrew.com`.

1. Cloudflare → **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*). Copia el token.
2. En **Public hostname**, agrega `webhook-dev.coffeecodebrew.com` con el servicio `http://codebrew-landing:80`.
3. En tu `.env`: `CLOUDFLARE_TUNNEL_TOKEN=<token>`. Desde entonces `pnpm local:up --tunnel` usa ese túnel.
4. Registra en CulqiPanel `https://webhook-dev.coffeecodebrew.com/api/webhooks/culqi?key=…` una sola vez.

## Paridad local, staging y producción (ADR 0008)

| | Local (`pnpm local:up`) | Staging (#125) | Producción |
|---|---|---|---|
| Código e imagen | Mismo `Dockerfile` y `docker-compose.yml` | Igual | Igual |
| `APP_ENV` | `local` | `staging` | `production` |
| Llaves de Culqi | De prueba (opcionales) | De prueba (obligatorias) | Live (obligatorias) |
| Entrada pública | Túnel de Cloudflare | Cloudflare | Cloudflare (`coffeecodebrew.com`) |
| Base de datos | Volumen local desechable | Volumen de la stack | Volumen de la stack, con respaldo (#126) |
| Correo | Sin `RESEND_API_KEY` solo se registra en logs | Resend | Resend |

Lo único que cambia entre entornos son variables: llaves, `APP_ENV`, `SITE_URL` y la contraseña de PostgreSQL. Si algo funciona en local con `pnpm local:up`, la misma imagen funciona en staging y producción.
