#!/usr/bin/env node
// Crea en GitHub el backlog de la migración: etiquetas, hitos, épicas, historias (sub-issues) y un
// proyecto privado con campos de Prioridad, Orden, Pista y Fase.
//
//   node scripts/github/bootstrap.mjs                 → simulación (no toca GitHub)
//   node scripts/github/bootstrap.mjs --apply         → ejecuta
//   node scripts/github/bootstrap.mjs --apply --skip-project
//   node scripts/github/bootstrap.mjs --repo OWNER/REPO
//
// Requisitos: GitHub CLI (https://cli.github.com), `gh auth login` y el permiso de proyectos:
//   gh auth refresh -s project,repo
// Es seguro volver a ejecutarlo: lo que ya existe (por título) no se duplica.

import { spawnSync } from 'node:child_process';
import { EPICS, STORIES, PEOPLE, PHASES, REPO_DEFAULT } from './backlog.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_PROJECT = args.includes('--skip-project');
const repoArg = args.indexOf('--repo');
const REPO = repoArg >= 0 ? args[repoArg + 1] : REPO_DEFAULT;
const OWNER = REPO.split('/')[0];
const PROJECT_TITLE = 'CodeBrew · Migración a ecommerce';

const log = (...m) => console.log(...m);
const failures = [];

// ───────────── Validación del backlog ─────────────
function validate() {
  const keys = new Map();
  STORIES.forEach((st, i) => {
    if (keys.has(st.key)) throw new Error(`Clave duplicada: ${st.key}`);
    keys.set(st.key, i);
  });
  const epicKeys = new Set(EPICS.map(e => e.key));
  for (const [i, st] of STORIES.entries()) {
    if (!epicKeys.has(st.epic)) throw new Error(`${st.key}: épica desconocida ${st.epic}`);
    if (st.who && !PEOPLE[st.who]) throw new Error(`${st.key}: responsable desconocido ${st.who}`);
    if (!PHASES[st.phase]) throw new Error(`${st.key}: fase inválida ${st.phase}`);
    for (const d of st.deps) {
      if (!keys.has(d)) throw new Error(`${st.key}: depende de ${d}, que no existe`);
      if (keys.get(d) >= i) throw new Error(`${st.key}: depende de ${d}, que aparece después en el orden`);
    }
  }
}

// ───────────── Utilidades de gh ─────────────
function gh(ghArgs, input) {
  const r = spawnSync('gh', ghArgs, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Error('No se encontró GitHub CLI (gh). Instálalo: https://cli.github.com');
    throw r.error;
  }
  if (r.status !== 0) throw new Error(`gh ${ghArgs.slice(0, 3).join(' ')} → ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}
const api = (path, method = 'GET', body) =>
  JSON.parse(gh(['api', path, '--method', method, ...(body ? ['--input', '-'] : [])], body ? JSON.stringify(body) : undefined) || 'null');
const apiLines = path =>
  gh(['api', path, '--paginate', '--jq', '.[] | tojson'])
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));

// ───────────── Etiquetas ─────────────
function labelSpecs() {
  const L = [];
  L.push({ name: 'epic', color: '5319e7', description: 'Épica (agrupa historias)' });
  for (const e of EPICS) L.push({ name: `epic:${e.key}`, color: 'c5def5', description: e.title.slice(0, 90) });
  for (const [n, c] of [['backend', '1d76db'], ['frontend', 'd93f0b'], ['db', '0e8a16'], ['infra', '5319e7'], ['docs', '0075ca']])
    L.push({ name: `area:${n}`, color: c, description: `Área ${n}` });
  for (const [n, c] of [['feature', 'a2eeef'], ['chore', 'cfd3d7'], ['spike', 'fbca04'], ['test', 'bfdadc']])
    L.push({ name: `type:${n}`, color: c, description: `Tipo ${n}` });
  for (const [n, c, d] of [['P0', 'b60205', 'Crítica: bloquea a otros'], ['P1', 'd93f0b', 'Alta'], ['P2', 'fbca04', 'Media'], ['P3', 'c2e0c6', 'Baja / congelada']])
    L.push({ name: `prio:${n}`, color: c, description: d });
  L.push({ name: 'migración', color: 'e99695', description: 'Crea una migración de BD: solo una abierta a la vez' });
  L.push({ name: 'solo-propietario', color: '000000', description: 'Requiere acceso del propietario (VPS, Culqi, ajustes del repo)' });
  L.push({ name: 'bloqueado', color: 'b60205', description: 'Esperando otra tarea o decisión' });
  return L;
}

// ───────────── Cuerpos de issues ─────────────
const checklist = items => items.map(i => `- [ ] ${i}`).join('\n');
const bullets = items => items.map(i => `- ${i}`).join('\n');

function storyBody(st, ctx) {
  const epic = EPICS.find(e => e.key === st.epic);
  const who = st.who ? `@${PEOPLE[st.who].handle}` : 'Sin asignar';
  const track = st.who ? PEOPLE[st.who].track : '—';
  const deps = st.deps.length
    ? st.deps.map(d => `${ctx.numbers.get(d) ? '#' + ctx.numbers.get(d) : d} (${d})`).join(', ')
    : 'Ninguna';
  return [
    `**Épica:** ${ctx.numbers.get(st.epic) ? '#' + ctx.numbers.get(st.epic) : st.epic} · ${epic.title}`,
    `**Orden:** ${ctx.order} de ${STORIES.length} · **Prioridad:** ${st.prio} · **${PHASES[st.phase]}** · **Pista:** ${track}`,
    `**Responsable:** ${who}`,
    `**Depende de:** ${deps}`,
    '',
    '## Objetivo',
    st.goal,
    '',
    '## Tareas',
    checklist(st.tasks),
    '',
    '## Criterios de aceptación',
    checklist(st.accept),
    st.files.length ? `\n## Archivos probables\n${bullets(st.files.map(f => '`' + f + '`'))}` : '',
    st.extra ? `\n> ${st.extra}` : '',
    '',
    '---',
    'Antes de empezar: confirma que las dependencias están cerradas. Al terminar: sigue la definición de terminado de `CONTRIBUTING.md` (pruebas, typecheck, sin tocar lo ajeno al alcance).'
  ]
    .filter(l => l !== undefined)
    .join('\n');
}

function epicBody(e, ctx, children = []) {
  const stories = children.length
    ? children.map(c => `- [ ] #${c.number} ${c.title}`).join('\n')
    : '_Las historias se enlazarán al crearse._';
  return [
    `**Responsable de la épica:** ${e.who ? '@' + PEOPLE[e.who].handle : 'Sin asignar'}`,
    '',
    '## Objetivo',
    e.goal,
    '',
    '## Historias',
    stories,
    '',
    '---',
    'Decisiones relacionadas: `docs/adr/`.'
  ].join('\n');
}

// ───────────── Simulación ─────────────
function dryRun() {
  log(`Repositorio: ${REPO}  (simulación; usa --apply para ejecutar)\n`);
  log(`Etiquetas: ${labelSpecs().length} · Hitos: ${PHASES.length} · Épicas: ${EPICS.length} · Historias: ${STORIES.length}\n`);
  log('Orden  Clave  Prio  Responsable      Depende de            Título');
  STORIES.forEach((st, i) =>
    log(
      `${String(i + 1).padStart(3)}    ${st.key.padEnd(5)}  ${st.prio}    ${(st.who ? PEOPLE[st.who].handle : '—').padEnd(15)}  ${(st.deps.join(',') || '—').padEnd(20)}  ${st.title}`
    )
  );
  const by = {};
  for (const st of STORIES) by[st.who ?? '—'] = (by[st.who ?? '—'] ?? 0) + 1;
  log('\nReparto: ' + Object.entries(by).map(([k, v]) => `${k === '—' ? 'sin asignar' : PEOPLE[k].handle}: ${v}`).join(' · '));
}

// ───────────── Ejecución ─────────────
async function main() {
  validate();
  if (!APPLY) return dryRun();

  log(`Repositorio: ${REPO}`);
  try { gh(['auth', 'status']); } catch { log('Aviso: `gh auth status` falló; se continúa porque la API responde.'); }
  const repoInfo = api(`repos/${REPO}`);
  if (!repoInfo?.permissions?.push) throw new Error('Tu usuario no tiene permiso de escritura en el repositorio.');

  // Etiquetas
  const existingLabels = new Set(apiLines(`repos/${REPO}/labels?per_page=100`).map(l => l.name));
  let created = 0;
  for (const l of labelSpecs()) {
    if (existingLabels.has(l.name)) continue;
    try { api(`repos/${REPO}/labels`, 'POST', l); created++; } catch (e) { failures.push(`label ${l.name}: ${e.message}`); }
  }
  log(`Etiquetas nuevas: ${created}`);

  // Hitos
  const milestones = new Map(apiLines(`repos/${REPO}/milestones?state=all&per_page=100`).map(m => [m.title, m.number]));
  for (const [i, title] of PHASES.entries()) {
    if (milestones.has(title)) continue;
    const m = api(`repos/${REPO}/milestones`, 'POST', { title, description: i === PHASES.length - 1 ? 'Trabajo congelado hasta decidir' : `Fase ${i} de la migración (sin fechas: el orden manda)` });
    milestones.set(title, m.number);
  }

  // Issues existentes
  const existing = new Map();
  for (const it of apiLines(`repos/${REPO}/issues?state=all&per_page=100`)) if (!it.pull_request) existing.set(it.title, { number: it.number, id: it.id });

  const ctx = { numbers: new Map(), ids: new Map(), order: 0 };
  const urls = new Map();
  const epicTitle = e => `[${e.key}] ${e.title}`;
  const storyTitle = st => `[${st.key}] ${st.title}`;

  // Épicas
  for (const e of EPICS) {
    const t = epicTitle(e);
    let it = existing.get(t);
    if (!it) {
      const r = api(`repos/${REPO}/issues`, 'POST', {
        title: t,
        body: epicBody(e, ctx),
        labels: ['epic', `epic:${e.key}`],
        assignees: e.who ? [PEOPLE[e.who].handle] : []
      });
      it = { number: r.number, id: r.id };
      log(`  épica #${r.number} ${t}`);
    }
    ctx.numbers.set(e.key, it.number);
    ctx.ids.set(e.key, it.id);
    urls.set(e.key, `https://github.com/${REPO}/issues/${it.number}`);
  }

  // Historias, en orden
  const children = new Map(EPICS.map(e => [e.key, []]));
  for (const [i, st] of STORIES.entries()) {
    ctx.order = i + 1;
    const t = storyTitle(st);
    let it = existing.get(t);
    if (!it) {
      try {
        const r = api(`repos/${REPO}/issues`, 'POST', {
          title: t,
          body: storyBody(st, ctx),
          labels: [...st.labels, `prio:${st.prio}`, `epic:${st.epic}`],
          assignees: st.who ? [PEOPLE[st.who].handle] : [],
          milestone: milestones.get(PHASES[st.phase])
        });
        it = { number: r.number, id: r.id };
        log(`  #${r.number} ${t}`);
      } catch (e) {
        failures.push(`issue ${st.key}: ${e.message}`);
        continue;
      }
    }
    ctx.numbers.set(st.key, it.number);
    ctx.ids.set(st.key, it.id);
    urls.set(st.key, `https://github.com/${REPO}/issues/${it.number}`);
    children.get(st.epic).push({ number: it.number, title: t });
  }

  // Sub-issues y lista de tareas en cada épica
  let subOk = 0;
  for (const e of EPICS) {
    for (const c of children.get(e.key)) {
      const key = STORIES.find(s => storyTitle(s) === c.title)?.key;
      try { api(`repos/${REPO}/issues/${ctx.numbers.get(e.key)}/sub_issues`, 'POST', { sub_issue_id: ctx.ids.get(key) }); subOk++; }
      catch (err) { if (!/already|duplicate|exist/i.test(err.message)) failures.push(`sub-issue ${key}: ${err.message.split('\n')[0]}`); }
    }
    try { api(`repos/${REPO}/issues/${ctx.numbers.get(e.key)}`, 'PATCH', { body: epicBody(e, ctx, children.get(e.key)) }); }
    catch (err) { failures.push(`épica ${e.key} (cuerpo): ${err.message.split('\n')[0]}`); }
  }
  log(`Sub-issues enlazados: ${subOk}`);

  if (!SKIP_PROJECT) {
    try { buildProject(ctx, urls); }
    catch (e) { failures.push(`proyecto: ${e.message}`); log('\nNo se pudo completar el proyecto. Revisa: gh auth refresh -s project'); }
  }

  log('\nListo.');
  if (failures.length) {
    log(`\nAvisos (${failures.length}):`);
    failures.forEach(f => log(' - ' + f));
    process.exitCode = 1;
  }
}

// ───────────── Proyecto (GitHub Projects v2) ─────────────
function buildProject(ctx, urls) {
  log('\nProyecto…');
  const list = JSON.parse(gh(['project', 'list', '--owner', OWNER, '--format', 'json', '--limit', '100'])).projects ?? [];
  let proj = list.find(p => p.title === PROJECT_TITLE);
  if (!proj) {
    proj = JSON.parse(gh(['project', 'create', '--owner', OWNER, '--title', PROJECT_TITLE, '--format', 'json']));
    log(`  proyecto #${proj.number} creado`);
  }
  const N = String(proj.number);
  try { gh(['project', 'edit', N, '--owner', OWNER, '--visibility', 'PRIVATE', '--description', 'Backlog de la migración a ecommerce. El campo Orden marca la secuencia de trabajo.']); } catch {}
  try { gh(['project', 'link', N, '--owner', OWNER, '--repo', REPO]); } catch {}

  const wanted = [
    ['Prioridad', 'SINGLE_SELECT', 'P0,P1,P2,P3'],
    ['Pista', 'SINGLE_SELECT', Object.values(PEOPLE).map(p => p.track).join(',')],
    ['Fase', 'SINGLE_SELECT', PHASES.join(',')],
    ['Orden', 'NUMBER']
  ];
  const fieldsOf = () => JSON.parse(gh(['project', 'field-list', N, '--owner', OWNER, '--format', 'json', '--limit', '50'])).fields;
  let fields = fieldsOf();
  for (const [name, type, opts] of wanted) {
    if (fields.some(f => f.name === name)) continue;
    gh(['project', 'field-create', N, '--owner', OWNER, '--name', name, '--data-type', type, ...(opts ? ['--single-select-options', opts] : [])]);
  }
  fields = fieldsOf();
  const F = n => fields.find(f => f.name === n);
  const opt = (field, name) => F(field).options.find(o => o.name === name)?.id;

  const inProject = new Map();
  for (const it of JSON.parse(gh(['project', 'item-list', N, '--owner', OWNER, '--format', 'json', '--limit', '500'])).items ?? [])
    if (it.content?.number) inProject.set(it.content.number, it.id);

  const items = [
    ...EPICS.map(e => ({ key: e.key, epic: true })),
    ...STORIES.map((s, i) => ({ key: s.key, s, order: i + 1 }))
  ];
  let done = 0;
  for (const item of items) {
    const num = ctx.numbers.get(item.key);
    if (!num) continue;
    let id = inProject.get(num);
    if (!id) id = JSON.parse(gh(['project', 'item-add', N, '--owner', OWNER, '--url', urls.get(item.key), '--format', 'json'])).id;
    const set = (fieldName, kind, value) => {
      const f = F(fieldName);
      const a = ['project', 'item-edit', '--id', id, '--project-id', proj.id, '--field-id', f.id];
      if (kind === 'select') { const o = opt(fieldName, value); if (!o) return; a.push('--single-select-option-id', o); }
      else a.push('--number', String(value));
      gh(a);
    };
    try {
      if (item.s) {
        set('Prioridad', 'select', item.s.prio);
        set('Fase', 'select', PHASES[item.s.phase]);
        if (item.s.who) set('Pista', 'select', PEOPLE[item.s.who].track);
        set('Orden', 'number', item.order);
      } else {
        const e = EPICS.find(x => x.key === item.key);
        if (e.who) set('Pista', 'select', PEOPLE[e.who].track);
        set('Orden', 'number', 0);
      }
    } catch (err) { failures.push(`campos de ${item.key}: ${err.message.split('\n')[0]}`); }
    if (++done % 10 === 0) log(`  ${done}/${items.length}`);
  }
  log(`  ${done} elementos en el proyecto`);
  log(`  https://github.com/users/${OWNER}/projects/${N}  (si es una organización: https://github.com/orgs/${OWNER}/projects/${N})`);
  log('  Vista recomendada: tabla ordenada por "Orden" y agrupada por "Pista"; tablero agrupado por Estado.');
}

main().catch(e => { console.error('\nError: ' + e.message); process.exit(1); });
