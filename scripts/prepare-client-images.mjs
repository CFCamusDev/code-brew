import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// The SSR storefront serves ready-made WebP files without resizing bags per request.
const source = new URL('../src/assets/pipeline/', import.meta.url);
const output = new URL('optimized/', source);
await fs.mkdir(output, { recursive: true });
const files = (await fs.readdir(source)).filter(file => file.endsWith('.webp'));
for (const file of files) {
  for (const width of [240, 480, 720]) {
    await sharp(fileURLToPath(new URL(file, source)))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72, effort: 5 })
      .toFile(path.join(fileURLToPath(output), file.replace('.webp', `-${width}.webp`)));
  }
}
console.log(`Prepared ${files.length * 3} client image variants.`);
