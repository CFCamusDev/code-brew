import * as Sentry from '@sentry/node';
import { version } from '../../../package.json';

// Seguimiento de errores con Sentry. Solo servidor, y solo si hay DSN: sin él todo esto es un no-op y la web
// funciona igual. Se desactivan las integraciones automáticas: así Sentry no adjunta por su cuenta la petición
// (URL con `?key=` del webhook, cookies, cabeceras) y solo viaja lo que enviamos a propósito.

let enabled = false;

export interface ErrorTrackingOptions {
  dsn?: string;
  environment?: string;
  /** Solo para pruebas: reemplaza el transporte HTTP. */
  transport?: Sentry.NodeOptions['transport'];
}

const SENSITIVE_QUERY = /([?&](?:key|token|secret|password|api_key|apikey)=)[^&\s"'<>]+/gi;

/** Quita secretos de un texto (p. ej. una URL de webhook dentro del mensaje de un error). */
export const redactSecrets = (text: string) => text.replace(SENSITIVE_QUERY, '$1[redacted]');

function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactSecrets(value);
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redactDeep(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item, depth + 1)]));
}

/** Última barrera antes de enviar: sin petición ni usuario, y sin secretos en textos ni contexto. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.request;
  delete event.user;
  if (event.message) event.message = redactSecrets(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactSecrets(exception.value);
  }
  if (event.extra) event.extra = redactDeep(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = redactDeep(event.contexts) as typeof event.contexts;
  return event;
}

/** Inicia Sentry una sola vez. Devuelve si quedó activo. */
export function initErrorTracking({ dsn, environment, transport }: ErrorTrackingOptions): boolean {
  if (enabled) return true;
  if (!dsn?.trim()) return false;
  Sentry.init({
    dsn: dsn.trim(),
    environment: environment || process.env.NODE_ENV || 'production',
    release: `codebrew@${version}`,
    tracesSampleRate: 0,
    defaultIntegrations: false,
    integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration({ mode: 'warn' }), Sentry.dedupeIntegration()],
    beforeSend: scrubEvent,
    transport
  });
  enabled = true;
  return true;
}

export const isErrorTrackingEnabled = () => enabled;

/** Envía un error con su contexto (id de petición, ruta, método…). No-op si el seguimiento no está activo. */
export function captureError(error: unknown, context: Record<string, unknown> = {}) {
  if (!enabled) return;
  const { requestId, ...extra } = context;
  Sentry.withScope(scope => {
    if (requestId) scope.setTag('requestId', String(requestId));
    scope.setExtras(extra);
    Sentry.captureException(error);
  });
}

/** Espera a que se envíen los eventos pendientes (útil antes de cerrar el proceso o en pruebas). */
export async function flushErrorTracking(timeoutMs = 2000) {
  if (enabled) await Sentry.flush(timeoutMs);
}

/** Solo para pruebas. */
export async function resetErrorTracking() {
  await Sentry.close(1000);
  enabled = false;
}
