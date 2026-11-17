# S6.1 — Administración de líneas

Issue: [#106](https://github.com/CFCamusDev/code-brew/issues/106).

Verificación local del 17 de noviembre de 2026:

- `pnpm typecheck`, `pnpm deps:check`, `pnpm test` (291 pruebas) y `pnpm build` correctos.
- `pnpm audit --audit-level=high` correcto con la excepción ya documentada en el proyecto.
- `pnpm test:docker`: imagen construida, PostgreSQL, app y Nginx saludables; migraciones verificadas; 291 pruebas unitarias y 93 de integración aprobadas. Diez pruebas de pasarela se omiten en este stack porque no configura FakeGateway; el job de integración del CI sí lo configura.
- `node scripts/perf/js-budget.mjs http://localhost:8080`: portada, producto y checkout dentro de sus presupuestos.
- Chrome local sobre `pnpm local:up`: inicio de sesión, creación, edición, rechazo de activación sin productos, activación con producto próximo, visibilidad en `/tienda`, archivado y ocultación. Sin errores JavaScript.
- Revisado a 1440 px y 390 px. Corregido el desbordamiento del menú del panel; comprobado que panel y tienda no exceden el ancho móvil. La tabla conserva desplazamiento horizontal interno.
- Los usuarios, productos y líneas creados para la comprobación del navegador se eliminaron al terminar.

## Capturas

Formulario a 1440 px:

![Formulario de líneas a 1440 px](lineas-1440.png)

Panel a 390 px:

![Panel de líneas a 390 px](lineas-390.png)

Tienda a 390 px con una línea activada durante la prueba:

![Tienda a 390 px](tienda-390.png)
