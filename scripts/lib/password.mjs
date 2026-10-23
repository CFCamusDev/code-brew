// Hash de contraseñas con scrypt (incluido en Node). Lo usan el servidor y scripts/admin/create-user.mjs.
// Formato: scrypt$N$r$p$saltBase64$hashBase64
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 128 * N * R * 2;

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = /** @type {Buffer} */ (await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM }));
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = /** @type {Buffer} */ (
    await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2
    })
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Mínimo razonable para el panel: 10 caracteres. */
export const MIN_PASSWORD_LENGTH = 10;
