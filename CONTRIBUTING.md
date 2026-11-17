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
- Las reglas están en `.dependency-cruiser.cjs` y el CI las ejecuta (`pnpm deps:check`, también en local). Lo que hacen cumplir:
  - `domain` solo importa de sí mismo y de `shared`: nada de `application`, `infrastructure`, `http`, `src/lib`, Drizzle, Astro ni React, y tampoco `UnitOfWork`.
  - `application` (casos de uso y `ports/`) habla con interfaces: no importa `infrastructure`, `http`, Drizzle ni Astro.
  - `infrastructure` no importa `http` ni páginas; `http` no importa `infrastructure`, salvo en `composition.ts` (raíz de composición donde se conectan los adaptadores).
  - Un módulo usa a otro solo por su `index.ts`, nunca por sus carpetas internas.
  - `shared` no depende de módulos ni de Astro, y solo `unit-of-work.ts` conoce la base de datos.
  - `src/server` no importa páginas ni componentes y no tiene ciclos.
- Si una regla bloquea algo legítimo, no la desactives: abre un ADR o corrige la dirección de la dependencia. Las pruebas de las reglas están en `tests/unit/architecture.test.ts` (fixtures en `tests/fixtures/architecture`).
- Frontend por funcionalidad en `src/features`, piezas base en `src/ui`, contratos zod en `src/contracts`.

## Auditoría de dependencias
El CI corre `pnpm audit --audit-level=high` y falla con cualquier aviso alto o crítico. Si un aviso no tiene versión corregida y no aplica a cómo usamos el paquete, se ignora **solo ese aviso** en `package.json` → `pnpm.auditConfig.ignoreGhsas`, y se anota aquí con su motivo. Se retira apenas exista una versión corregida.

| Aviso | Paquete | Por qué no aplica | Revisar |
|---|---|---|---|
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) | `picomatch` ≤ 4.0.7 (vía `dependency-cruiser` y `astro` → `unstorage` → `anymatch`) | El ReDoS requiere que el atacante controle el **patrón** glob. Todos los patrones salen del código o la configuración, nunca de lo que envía un usuario. Sin versión corregida al 17-nov-2026. | Cuando `picomatch` publique la corrección |

## Definición de terminado
- [ ] Criterios de aceptación cumplidos
- [ ] `pnpm typecheck`, `pnpm test` y, si aplica, `pnpm test:integration` en verde
- [ ] Pruebas nuevas para la lógica nueva (concurrencia si toca stock)
- [ ] Sin secretos, sin datos reales, sin cambios fuera del alcance
- [ ] Documentación y ADR al día
