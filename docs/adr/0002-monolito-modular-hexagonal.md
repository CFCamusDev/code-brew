# ADR 0002 · Monolito modular con arquitectura hexagonal por módulo

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
El backend vive dentro de Astro (páginas, API y lógica en un proceso). Algunas piezas mezclan responsabilidades: payments.ts combina Culqi, base de datos y correo; shop.ts combina cotización y creación de pedidos. No hay app móvil ni integraciones externas previstas.

## Decisión
Se mantiene un solo despliegue (monolito) organizado en módulos: `src/server/modules/{catalog,ordering,inventory,payments,shipping,complaints,settings,identity}`, cada uno con `domain/`, `application/`, `infrastructure/` y `http/`. El dominio es puro (sin Drizzle ni Astro). Los casos de uso abren la transacción (UnitOfWork). Los endpoints de `src/pages/api` son controladores delgados con validación zod. El frontend se organiza por funcionalidad (`src/features`, `src/ui`, `src/contracts`) y usa islas de Astro solo donde hay interacción.

## Consecuencias
- Principios SOLID aplicados: puertos pequeños (PaymentGateway), dependencias hacia el dominio, módulos abiertos a extensión.
- Transacciones (ACID) en una sola capa.
- Los límites se hacen cumplir en el CI con dependency-cruiser.
- Extraer una API separada más adelante sería mover carpetas, no reescribir.

## Alternativas consideradas
- **API separada (Fastify/NestJS):** duplica la operación (CI, despliegue, CORS, sesiones) para un equipo de tres sin necesidad actual.
