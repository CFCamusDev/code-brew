# QA — Flujo de compra (CB-201)

Responsable: Brayni. Alcance: prueba manual del flujo completo (catálogo → carrito →
checkout → pago con Culqi) en navegador de escritorio y en viewport móvil, con los
distintos métodos de pago que ofrece el widget de Culqi.

## Entorno de prueba

- Rama: `feature/CB-201-qa-checkout` (desde `develop`).
- Base de datos local (`docker-compose.dev.yml`), seed de `src/data/catalog.json` +
  stock puesto a 50 unidades por variante a mano (el seed no carga stock, se gestiona
  desde el panel admin — ver nota en Hallazgos).
- Llaves de prueba de Culqi (`pk_test_` / `sk_test_`) proporcionadas por Brayni y
  configuradas en `.env` local.
- Navegador: Chromium (herramienta de automatización). Viewport "desktop" (~1019 px)
  y viewport "mobile" (375×812, iPhone). **No se probó en un dispositivo/navegador
  real** (Safari iOS, Chrome Android) — ver Pendientes.

## Resultados

| # | Caso | Desktop | Mobile (375×812) | Notas |
|---|------|:---:|:---:|---|
| 1 | Agregar producto al carrito | ✅ | ✅ | Contador del carrito se actualiza al instante |
| 2 | Ver/editar carrito (cantidad, quitar) | ✅ | — | Probado solo en desktop |
| 3 | Checkout: formulario de datos + envío | ✅ | ✅ | Zona de envío recalcula subtotal/envío/total en vivo |
| 4 | Confirmar pedido (crea orden `pending`) | ✅ | ✅ | Número de orden correlativo (`CB-000001`, `CB-000002`...) |
| 5 | Pago con **tarjeta aprobada** (Culqi, `4111 1111 1111 1111`) | ✅ | ✅ | Orden pasa de `Pendiente de pago` a `Pagado` al instante, sin recargar |
| 6 | Pago con **tarjeta rechazada** | ⛔ Bloqueado | — | Ver Hallazgos — no encontré el número de tarjeta de prueba oficial de Culqi para forzar un rechazo |
| 7 | **3DS** (autenticación adicional) | ⛔ No alcanzado | — | La tarjeta aprobada no disparó 3DS; depende de qué tarjeta de prueba lo activa (no documentado a mano) |
| 8 | **Yape** | 🟡 Parcial | — | El tab se abre bien y muestra las instrucciones correctas, pero la aprobación real requiere la app de Yape en un teléfono — no se puede automatizar |
| 9 | **Billeteras digitales** (Plin, BBVA, Scotia, etc. vía QR) | ✅ UI | — | Genera la pantalla de QR correctamente; no se escaneó un QR real |
| 10 | **PagoEfectivo** (código para pagar en banca móvil/agente) | ✅ | — | Genera el código de 9 dígitos y la página de pedido pasa correctamente a "esperando confirmación" (actualización async por webhook) |
| 11 | Responsive del formulario de checkout | ✅ | ✅ | Una sola columna en mobile, campos y botones con buen tamaño de toque |
| 12 | Responsive del widget de Culqi | ✅ | ✅ | El selector de método de pago pasa a dropdown en mobile; se probó tarjeta aprobada completa en este viewport |

## Hallazgos

1. **Stock en 0 por defecto.** El seed (`pnpm db:seed`) crea los productos pero no
   carga stock — todas las variantes aparecen "Agotado por ahora" hasta que alguien
   lo configura desde el panel admin (o a mano en la base, como hice yo para esta
   prueba). Si el equipo hace QA en un ambiente nuevo, van a pegarse en el mismo
   punto. Vale la pena documentarlo en el README o dejarlo como parte del seed de
   desarrollo.
2. **No tengo el número de tarjeta de prueba de "rechazo" de Culqi.** Probé dos
   números genéricos (`4000000000000002`, `4000000000000010`) y el widget los
   rechaza en la validación del lado del cliente ("No pudimos validar tu tarjeta")
   antes de llegar siquiera al cargo — no es necesariamente el comportamiento real
   de un rechazo por fondos insuficientes o similar. Necesito el número oficial
   desde el CulqiPanel (sección de documentación/sandbox) para probar esto y el
   caso de 3DS correctamente.
3. **Yape y el escaneo real de QR no se pueden automatizar** desde este entorno
   (requieren un teléfono con la app correspondiente). El UI se ve y se comporta
   bien, pero falta la prueba end-to-end con un dispositivo real.

## Pendiente

- [ ] Conseguir el número de tarjeta de prueba de Culqi para **rechazo** y para
      **3DS**, y repetir los casos 6 y 7.
- [ ] Probar Yape y el QR de billeteras digitales con un teléfono real.
- [ ] Repetir el flujo completo en **staging** (una vez desplegado, según el
      backlog del sprint).
- [ ] Probar en **iPhone real (Safari)** y **Android real (Chrome)** — lo hecho acá
      es emulación de viewport en Chromium, no el motor real de Safari.
- [ ] Probar PagoEfectivo hasta la confirmación real (requiere pagar el código
      generado en un banco/agente, o que el equipo tenga un atajo de sandbox para
      simular el webhook).

---

# Pagos de punta a punta con el sandbox de Culqi (S4.2)

Responsable: Jansel. Fecha: 16-nov-2026. Entorno: build de producción en local con `pnpm local:up --tunnel` (ver `docs/entorno-local.md`), llaves de prueba del panel de CodeBrew y webhook `order.status.changed` registrado en CulqiPanel → Desarrollo → Webhooks.

## Guion manual

Para cada método: crear un pedido con Hotfix, pulsar **Pagar** en `/pedido/[id]` y revisar el pedido, el stock y CulqiPanel.

| # | Método | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Tarjeta aprobada | Visa de prueba de la [página de tarjetas de Culqi](https://docs.culqi.com/es/documentacion/pagos-online/tarjetas-de-prueba) | Pedido «Pagado» al instante; stock −1; venta en CulqiPanel → Ventas (CulqiOnline) |
| 2 | Tarjeta rechazada | Tarjeta de rechazo de esa misma página | Mensaje del banco; pedido pendiente; pago `failed`; se puede reintentar |
| 3 | 3DS | Tarjeta de prueba con autenticación | Ventana del banco; al completarla, pedido «Pagado» |
| 4 | Yape | Código de prueba de Yape | Igual que tarjeta: confirmación en la respuesta, **sin webhook** |
| 5 | Agentes y bodegas / banca / billetera | Elegir el medio y generar el código | La página muestra el **CIP** (#157). En 1–2 min, CulqiPanel → Webhooks → Historial: `order.status.changed` con **200 OK**. Pedido sigue pendiente hasta que el CIP se pague |
| 6 | CIP vencido | Esperar el vencimiento (24 h) | Aviso al webhook; el pago queda `failed` y el pedido pendiente |
| 7 | CIP pagado | — | **No se puede simular en el sandbox**: queda para el pago real de bajo monto (#127) |

## Resultados (16-nov-2026)

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| 1 | Tarjeta aprobada | ✅ | Pedido CB-000009 pagado con `chr_test_…`, stock descontado una vez |
| 5 | CIP generado | ✅ | CB-000013: CIP 328071977 en la página del pedido; aviso `order.status.changed` → **200 OK** por el túnel; la tienda consultó la orden (pendiente) y no la confirmó |
| — | Webhook sin clave | ✅ | 401 por el túnel; con la clave, 200 |
| 7 | CIP pagado | ⛔ | Sin opción de simular en CulqiPanel ni en la documentación pública |

## Automatizado (CI)

`tests/integration/payments-flow.test.ts` corre en el CI con `PAYMENT_GATEWAY=fake` (FakeGateway) contra el servidor real y PostgreSQL. Cubre:
- **Tarjeta o Yape aprobados:** pedido pagado y stock descontado **una sola vez**, aunque el cobro se repita.
- **Rechazo:** sin stock descontado, con el pago registrado como fallido, y reintento exitoso después.
- **3DS:** primero pide autenticación y luego confirma.
- **Error de la pasarela.**
- **Órdenes (PagoEfectivo, agentes, billeteras):** la sesión crea la orden y la reutiliza; el webhook consulta la orden y no confirma mientras siga pendiente.
- **Pedido ya pagado:** no admite otro cobro.

La idempotencia ante el webhook antes o después del cargo está en `tests/unit/payments-use-cases.test.ts`. `PAYMENT_GATEWAY=fake` está prohibido en `APP_ENV=staging|production` y junto con llaves live: lo rechaza `config:check`.

## Hallazgos

1. **La página del pedido no mostraba el CIP.** Si el cliente cerraba la ventana de Culqi, perdía el código. Corregido en #156 / #157.
2. **Llaves de otra cuenta.** El `.env` tenía llaves de un panel distinto al del webhook: las órdenes se creaban en otra cuenta y el webhook nunca llegaba. Comprobar que la `pk_test_…` del `.env` sea la de **Desarrollo → API Keys** del mismo panel.
3. **La sesión de CulqiPanel vence sin avisar.** Ventas e Historial aparecen vacíos hasta cerrar sesión y volver a entrar. En Ventas hay que elegir **CulqiOnline** arriba.
4. **El túnel rápido cambia de dirección** al reiniciarse. Los avisos dan 404 hasta actualizar la URL. Solución: túnel con nombre (`docs/entorno-local.md`).
5. **`pnpm dev` no sirve para el webhook.** Vite rechaza dominios externos; hay que usar `pnpm local:up`.
6. **Tarjeta y Yape no usan webhook** (se confirman en la respuesta del cargo). El aviso llega 1–2 minutos después del cambio de la orden.
