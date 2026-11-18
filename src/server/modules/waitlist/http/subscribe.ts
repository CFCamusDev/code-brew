import type { APIContext } from 'astro';
import { isIP } from 'node:net';
import { waitlistInput } from '../../../../contracts/waitlist';
import { logger } from '../../../../lib/server/logger';
import { clientIp } from '../../identity';
import { systemClock } from '../../../shared/clock';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { WaitlistThrottle, WAITLIST_WINDOW_MS } from '../domain/waitlist';
import { subscribeToWaitlist } from '../index';

const throttle = new WaitlistThrottle(systemClock);
const MAX_BODY = 4096;
const reply = (data: unknown, status: number, extra: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extra } });

export async function subscribeRequest({ request, clientAddress }: APIContext): Promise<Response> {
  const candidate = clientIp(request, clientAddress);
  if (!throttle.take(isIP(candidate) ? candidate : clientAddress)) return reply({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, 429, { 'Retry-After': String(WAITLIST_WINDOW_MS / 1000) });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({ error: 'Envía la solicitud en formato JSON.' }, 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({ error: 'La solicitud es demasiado grande.' }, 413);
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Solicitud inválida.' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return reply({ error: 'La solicitud es demasiado grande.' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return reply({ error: 'Solicitud JSON inválida.' }, 400); }
  const parsed = waitlistInput.safeParse(body);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, 400);
  try {
    await subscribeToWaitlist(parsed.data);
    // Misma respuesta para altas y duplicados: no expone si el correo ya estaba registrado.
    return reply({ ok: true, message: 'Tu solicitud para recibir el aviso quedó registrada.' }, 200);
  } catch (error) {
    if (error instanceof DomainError) return reply({ error: error.message }, error instanceof NotFoundError ? 404 : 400);
    // Un error SQL puede incluir el correo en sus parámetros: no se registra el error original.
    logger.error('[waitlist] no se pudo registrar la solicitud');
    return reply({ error: 'No se pudo registrar el aviso. Inténtalo de nuevo más tarde.' }, 503);
  }
}
