import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * ¿La clave recibida en `?key=` coincide con alguna de las vigentes? Acepta varias a la vez para poder rotarla sin
 * perder eventos: se registra la nueva en CulqiPanel mientras la anterior sigue válida, y luego se retira.
 *
 * Compara hashes del mismo largo en tiempo constante y recorre todas las claves siempre, para no revelar por el
 * tiempo de respuesta ni el largo ni cuál clave coincidió.
 */
export function isValidWebhookKey(received: string | null, validKeys: (string | undefined)[]): boolean {
  const keys = validKeys.map(key => key?.trim()).filter((key): key is string => !!key);
  if (!received || keys.length === 0) return false;
  const receivedDigest = digest(received);
  let matched = false;
  for (const key of keys) {
    if (timingSafeEqual(receivedDigest, digest(key))) matched = true;
  }
  return matched;
}
