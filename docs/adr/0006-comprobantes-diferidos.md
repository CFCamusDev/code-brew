# ADR 0006 · Comprobantes electrónicos (SUNAT) diferidos; modelo preparado

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
Hoy no se emiten boletas ni facturas. Se prevé hacerlo en el futuro.

## Decisión
No se construye la emisión ahora. Se prepara el modelo: tipo de documento del cliente (DNI, RUC, CE), desglose de IGV (base y monto) al crear el pedido y un patrón de correlativos atómicos como el de reclamos. El proveedor (OSE/PSE) se decide después y las reglas se validan con el contador.

## Consecuencias
- Migrar a comprobantes más adelante no exigirá reescribir pedidos.
- Pequeño costo ahora en el checkout (tipo de documento).

## Alternativas consideradas
- Integrar un proveedor ahora: prematuro sin decisión de negocio.
