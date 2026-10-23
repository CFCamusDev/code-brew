// Genera los íconos del navegador a partir del logo real (taza con </>).
// Uso: node scripts/brand/generate-favicons.mjs
// Logo claro sobre un cuadrado redondeado verde tinta: se distingue en pestañas claras y oscuras.
import sharp from 'sharp';

const LOGO = 'public/assets/brand/codebrew-cup-light.webp';
const INK = '#203c32';

async function icon(size, file, { rounded = true } = {}) {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${INK}"/></svg>`
  );
  const logoSize = Math.round(size * 0.82);
  const logo = await sharp(LOGO).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const offset = Math.round((size - logoSize) / 2);
  await sharp(background).composite([{ input: logo, left: offset, top: offset }]).png().toFile(file);
  console.log(`[favicon] ${file} (${size}px)`);
}

await icon(32, 'public/favicon-32.png');
await icon(192, 'public/favicon-192.png');
// iOS redondea el ícono por su cuenta: va a sangre.
await icon(180, 'public/apple-touch-icon.png', { rounded: false });
