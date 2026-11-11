#!/usr/bin/env node
// Sincroniza la columna "Pista" del tablero con el responsable de cada historia/épica en backlog.mjs.
// Uso (desde tu máquina, con gh autenticado y permiso "project"):  node scripts/github/sincronizar-pista.mjs
// Opcional: --apply-assignees también actualiza los responsables de los issues (ya aplicado el 11-nov).
import { execFileSync } from 'node:child_process';
import { STORIES, EPICS, PEOPLE, REPO_DEFAULT } from './backlog.mjs';

const REPO = process.argv.find(a => a.startsWith('--repo='))?.slice(7) ?? REPO_DEFAULT;
const OWNER = REPO.split('/')[0];
const TITLE = 'CodeBrew · Migración a ecommerce';
const gh = a => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const J = a => JSON.parse(gh(a));

const proj = (J(['project', 'list', '--owner', OWNER, '--format', 'json', '--limit', '100']).projects ?? []).find(p => p.title === TITLE);
if (!proj) { console.error('No encuentro el proyecto: ' + TITLE); process.exit(1); }
const N = String(proj.number);
const fields = J(['project', 'field-list', N, '--owner', OWNER, '--format', 'json', '--limit', '50']).fields;
const pista = fields.find(f => f.name === 'Pista');
if (!pista) { console.error('No existe el campo Pista'); process.exit(1); }
const optId = name => pista.options.find(o => o.name === name)?.id;

const items = J(['project', 'item-list', N, '--owner', OWNER, '--format', 'json', '--limit', '500']).items ?? [];
const byTitle = new Map(items.map(i => [i.content?.title ?? i.title, i.id]));
const wanted = [
  ...EPICS.map(e => ({ title: `[${e.key}] ${e.title}`, who: e.who })),
  ...STORIES.map(s => ({ title: `[${s.key}] ${s.title}`, who: s.who }))
];
let ok = 0; const miss = [];
for (const w of wanted) {
  const id = byTitle.get(w.title);
  const opt = optId(PEOPLE[w.who].track);
  if (!id || !opt) { miss.push(w.title); continue; }
  gh(['project', 'item-edit', '--id', id, '--project-id', proj.id, '--field-id', pista.id, '--single-select-option-id', opt]);
  if (++ok % 20 === 0) console.log(`  ${ok}/${wanted.length}`);
}
console.log(`Pista actualizada en ${ok} elementos.` + (miss.length ? `\nNo encontrados (${miss.length}):\n - ` + miss.join('\n - ') : ''));
