# S8.4 / #125: verificación local

Fecha: 2026-11-17. Base: `develop`, revisión `b08cd73`.

| Comprobación | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm deps:check` | Sin infracciones |
| `pnpm test` | 330 pruebas correctas |
| `pnpm build` | Correcto |
| `pnpm audit --audit-level=high` | Código 0 con la excepción existente CVE-2026-112366; conserva avisos de menor severidad |
| `pnpm test:docker` | Build, salud, tipos, 330 unitarias, consistencia de migraciones y 109 pruebas de integración correctas; 10 omitidas según la configuración existente |
| `pnpm test:staging` | Compose aislado, volumen/red/BD propios, puerto de loopback, arranque y salud con APP_ENV=staging; limpieza de recursos QA |

Las pruebas del cliente de despliegue simulan Portainer: rechazan destino incorrecto, preservan variables, esperan un identificador nuevo y detectan una revisión distinta. La prueba Docker usa claves con formato test para arrancar y no realiza pagos externos.

No se accedió al VPS ni a Portainer y no se registró un webhook ni se realizó un pago sandbox real. El propietario prefirió crear la stack personalmente. Los tres criterios remotos pendientes están en [la guía de staging](../../staging.md); #125 debe permanecer abierta hasta verificarlos.
