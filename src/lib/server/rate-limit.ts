/** Limitador de intentos en memoria por clave (IP, correo, etc.), con ventana deslizante. */
export function createRateLimiter(windowMs: number, maxAttempts: number) {
  const attempts = new Map<string, { count: number; first: number }>();

  function isLocked(key: string) {
    const entry = attempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > windowMs) {
      attempts.delete(key);
      return false;
    }
    return entry.count >= maxAttempts;
  }

  function recordAttempt(key: string) {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.first > windowMs) attempts.set(key, { count: 1, first: Date.now() });
    else entry.count++;
  }

  function reset(key: string) {
    attempts.delete(key);
  }

  return { isLocked, recordAttempt, reset };
}
