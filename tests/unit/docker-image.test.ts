import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// El contenedor corre migrate.mjs y seed.mjs antes de arrancar (CMD del Dockerfile). Si el seed importa un archivo de
// datos que la imagen no copia, el contenedor no levanta: pasó con src/data/pipeline.json (S2.5).
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('imagen de producción', () => {
  it('copia todos los archivos de datos que importan los scripts de arranque', () => {
    const dockerfile = read('Dockerfile');
    const copied = dockerfile.match(/^COPY (src\/data\/[^\n]+) \.\/src\/data\/$/m)?.[1].split(/\s+/) ?? [];
    for (const script of ['scripts/db/seed.mjs', 'scripts/db/migrate.mjs']) {
      const imports = [...read(script).matchAll(/from '\.\.\/\.\.\/(src\/data\/[^']+)'/g)].map(match => match[1]);
      for (const file of imports) expect(copied, `${script} importa ${file}`).toContain(file);
    }
  });
});
