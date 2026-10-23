import postgres from 'postgres';

export const BASE_URL = process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4321';

export const ADMIN = { email: 'ci-admin@codebrew.test', password: 'ci-admin-password-123' };
export const OPERATOR = { email: 'ci-operador@codebrew.test', password: 'ci-operador-password-123' };

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Las pruebas de integración necesitan DATABASE_URL');
  return postgres(process.env.DATABASE_URL, { max: 1 });
}

export async function api(path: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    redirect: 'manual',
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(init.cookie ? { Cookie: init.cookie } : {}),
      ...init.headers
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // respuesta HTML o vacía
  }
  return { status: response.status, headers: response.headers, json, text };
}

export async function login(user: { email: string; password: string }) {
  const response = await api('/api/admin/login', { body: user });
  const cookie = response.headers.get('set-cookie')?.match(/cb_admin=[^;]+/)?.[0];
  if (response.status !== 200 || !cookie) throw new Error(`No se pudo iniciar sesión como ${user.email}: ${response.status}`);
  return cookie;
}

export const customer = {
  name: 'Cliente Integración',
  email: 'delivered@resend.dev',
  phone: '987654321',
  zone: 'lima',
  region: 'Lima',
  city: 'Lima',
  district: 'Miraflores',
  address: 'Av. Prueba 123'
};
