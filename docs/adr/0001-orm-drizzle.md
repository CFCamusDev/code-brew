# ADR 0001 · Mantener Drizzle como ORM

- **Estado:** Aceptada
- **Fecha:** 2026-11-11
- **Decidieron:** Code-Chavez, doflamingo-ing, CFCamusDev

## Contexto
El proyecto ya usa Drizzle ORM con PostgreSQL, 11 migraciones SQL versionadas y consultas con SELECT FOR UPDATE, ON CONFLICT y restricciones CHECK en el flujo de pagos.

## Decisión
Se mantiene Drizzle. No se migra a Prisma.

## Consecuencias
- Cero costo de migración y sin reescribir las transacciones de pago.
- Las migraciones siguen siendo SQL versionado en `drizzle/`.
- El acceso a datos queda aislado en `infrastructure/` de cada módulo; cambiar de ORM en el futuro no tocaría el dominio.

## Alternativas consideradas
- **Prisma:** buen cliente generado, pero exige `$queryRaw` para bloqueos y restricciones CHECK, y reescribir ~12 archivos de consultas sin beneficio inmediato.
