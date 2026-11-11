# ADR 0008 · Culqi: misma configuración en local, staging y producción

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
Culqi está integrado (cargo con token, 3DS, órdenes para PagoEfectivo y billeteras, webhook que re-consulta, reembolsos) y sigue en modo demo.

## Decisión
Local, staging y producción usan el mismo código; cambian solo las llaves. Local corre la app completa en Docker con un túnel público para el webhook. Una validación de arranque impide llaves de prueba en producción y exige las tres variables de Culqi. Pagos se prueban con un FakeGateway detrás del puerto PaymentGateway y con sandbox de Culqi de punta a punta.

## Consecuencias
- Pasar a producción es cambiar llaves y registrar el webhook.
- Primer cobro real de bajo monto con reembolso antes de abrir al público.

## Alternativas consideradas
- Probar solo en producción: riesgo inaceptable.
