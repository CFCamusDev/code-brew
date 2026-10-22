/** Envía una acción del panel. Si la sesión venció, lleva al login y vuelve a esta página. */
export async function adminPost<T = Record<string, unknown>>(url: string, body: unknown): Promise<T & { error?: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => null);
  if (!response) return { error: 'Sin conexión. Inténtalo de nuevo.' } as T & { error?: string };
  if (response.status === 401) {
    window.location.assign(`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  const data = await response.json().catch(() => ({}));
  return response.ok ? data : { ...data, error: data.error ?? 'No se pudo completar la acción.' };
}
