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
