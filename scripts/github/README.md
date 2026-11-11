# Crear el backlog en GitHub

Un solo comando crea etiquetas, hitos, 10 épicas, 68 historias (como sub-issues, asignadas y ordenadas) y el proyecto privado.

1. Instalar GitHub CLI: https://cli.github.com (en Windows: `winget install GitHub.cli`).
2. Iniciar sesión con permisos de repositorio y proyectos:
   ```
   gh auth login
   gh auth refresh -s project,repo
   ```
3. Simulación (no toca GitHub; muestra orden, responsables y dependencias):
   ```
   node scripts/github/bootstrap.mjs
   ```
4. Ejecutar de verdad:
   ```
   node scripts/github/bootstrap.mjs --apply
   ```
   Opciones: `--skip-project` (solo issues), `--repo OWNER/REPO`.

Es seguro repetirlo: lo que ya existe (por título) no se duplica. Para cambiar el backlog, edita `backlog.mjs` y vuelve a ejecutarlo; solo se crean las historias nuevas.

El orden de trabajo es el campo **Orden** del proyecto. Vista recomendada: tabla ordenada por Orden y agrupada por Pista.
