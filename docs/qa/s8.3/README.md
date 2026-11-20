# S8.3 / #126 — evidencia local

Fecha: 2026-11-20. Rama: `feat/S8.3-126-backups-postgresql`, desde `develop` (`b08cd73`).

- `pnpm test`: 326 pruebas correctas (incluye 11 casos nuevos de respaldos).
- `pnpm typecheck`, `pnpm deps:check`, `pnpm build` y `pnpm audit --audit-level=high`: correctos.
- `pnpm test:docker`: build, arranque saludable, tipos, 326 unitarias, consistencia de migraciones y 109 pruebas de integración correctas; 10 omitidas por la configuración existente.
- `node scripts/test-backups.mjs`: correcto en Docker Desktop local. Imagen PostgreSQL 17 con Restic 0.18.1; repositorio QA cifrado y desechable.

Se aplicaron migraciones y seed reales en una base aislada, se añadieron datos Unicode y una relación con clave foránea, se respaldaron y se restauraron en una base vacía. Coinciden productos, historial de migraciones y filas de ensayo. La FK sigue rechazando referencias inexistentes después de restaurar.

El segundo ensayo completo registró **1,84 segundos** en la operación `restore` (consulta de destino/snapshot, descarga, pg_restore y ANALYZE). No incluye aprovisionar PostgreSQL ni arrancar/verificar la aplicación. No representa un RTO de producción.

También se verificó que no se sobrescribe una base ocupada ni la base origen, que una contraseña Restic incorrecta no permite verificar ni restaurar, que el destino sigue vacío tras ese fallo y que un pg_dump fallido no añade snapshots parciales. Las unitarias cubren configuración, frescura de 24 h, fecha futura, identificadores y salida temprana ante fallos. Todos los recursos QA se limpian al terminar.

No se instaló el timer en el VPS, no se accedió a un bucket externo y no se restauró en staging real. Esas verificaciones del propietario siguen pendientes y #126 permanece abierta. Procedimiento en [el runbook](../../runbooks/backups.md).
