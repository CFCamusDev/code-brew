# ADR 0005 · Reservar stock al crear el pedido y descontar al pagar

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
Hoy el stock se descuenta al confirmar el pago. Dos clientes pueden crear pedidos del último stock; el segundo paga y queda con stock_shortage para revisión manual.

## Decisión
Se reserva al crear el pedido (tabla `stock_reservations`) y se descuenta el stock físico al confirmar el pago. disponible = stock físico − reservas vigentes. Vencimiento: 30 min para tarjeta y Yape; para PagoEfectivo o billetera, hasta el vencimiento de la orden en Culqi con tope de 48 h. Las reservas vencidas se ignoran al calcular disponibilidad. stock_shortage queda como red de seguridad.

## Consecuencias
- Sin sobreventa; el stock del admin sigue siendo el físico.
- La creación del pedido bloquea variantes en orden de id dentro de una transacción.
- Se necesitan pruebas de concurrencia y manejo de pagos tardíos.

## Alternativas consideradas
- **Descontar al crear el pedido:** más simple, pero mezcla "lo que tengo" con "lo que prometí" y ensucia el historial de movimientos. Descartada.
