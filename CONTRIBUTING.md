# Cómo trabajamos

Somos tres y todos tocamos todo. Para no pisarnos, el orden lo marca el tablero, no el calendario.

## Tablero y orden
- Proyecto privado **CodeBrew · Migración a ecommerce**. Se trabaja de menor a mayor **Orden** dentro de tu **Pista**.
- Antes de empezar una historia: sus dependencias (**Depende de**) deben estar cerradas. Muévela a *In Progress* y asígnatela.
- Una persona, una historia a la vez. Si te bloqueas, etiqueta `bloqueado` y comenta qué falta.

## Ramas y commits
- Rama de trabajo desde `develop`: `feat/S2.1-product-lines`, `fix/…`, `chore/…`. Vida corta.
- Commits convencionales: `feat(catalog): …`, `fix(payments): …`, `chore(db): …`.
- PR hacia `develop` con la plantilla. Una aprobación y CI verde antes de fusionar. `main` solo recibe releases.

## Migraciones de base de datos
- Solo **una migración abierta a la vez** (etiqueta `migración`). Es la forma de evitar choques en la numeración de `drizzle/`.
- Siempre aditivas (expand → migrate → contract). Nunca editar una migración ya fusionada.

## Arquitectura (ADR 0002)
- `src/server/modules/<módulo>/{domain,application,infrastructure,http}`.
- El dominio no importa Drizzle, Astro ni nada de infraestructura (lo verifica el CI).
- Las transacciones se abren en los casos de uso. Los endpoints validan con zod y delegan.
- Frontend por funcionalidad en `src/features`, piezas base en `src/ui`, contratos zod en `src/contracts`.

## Definición de terminado
- [ ] Criterios de aceptación cumplidos
- [ ] `pnpm typecheck`, `pnpm test` y, si aplica, `pnpm test:integration` en verde
- [ ] Pruebas nuevas para la lógica nueva (concurrencia si toca stock)
- [ ] Sin secretos, sin datos reales, sin cambios fuera del alcance
- [ ] Documentación y ADR al día
