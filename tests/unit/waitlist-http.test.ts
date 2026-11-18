import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToWaitlist } from '../../src/server/modules/waitlist';
import { subscribeRequest } from '../../src/server/modules/waitlist/http/subscribe';
import { logger } from '../../src/lib/server/logger';

vi.mock('../../src/server/modules/waitlist', () => ({ subscribeToWaitlist: vi.fn() }));
const input = { email: ' PERSONA@EXAMPLE.TEST ', productSlug: 'coldstart', consent: true };
const context = (body: unknown) => ({ request: new Request('http://localhost/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), clientAddress: '127.0.0.91' }) as APIContext;
beforeEach(() => { vi.restoreAllMocks(); vi.mocked(subscribeToWaitlist).mockReset(); });
describe('frontera HTTP de interesados', () => {
  it('solo entrega al caso de uso datos validados y normalizados', async () => {
    vi.mocked(subscribeToWaitlist).mockResolvedValue();
    const response = await subscribeRequest(context(input));
    expect(response.status).toBe(200);
    expect(subscribeToWaitlist).toHaveBeenCalledWith({ ...input, email: 'persona@example.test' });
    expect(JSON.stringify(await response.json())).not.toContain('persona@example.test');
  });
  it('rechaza consentimiento falso antes de persistir', async () => {
    expect((await subscribeRequest(context({ ...input, consent: false }))).status).toBe(400);
    expect(subscribeToWaitlist).not.toHaveBeenCalled();
  });
  it('un fallo de persistencia no expone ni registra parámetros personales', async () => {
    vi.mocked(subscribeToWaitlist).mockRejectedValue(new Error('SQL params: persona@example.test'));
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await subscribeRequest(context(input));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('persona@example.test');
    expect(log).toHaveBeenCalledWith('[waitlist] no se pudo registrar la solicitud');
  });
});
