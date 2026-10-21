import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const r = handler(url, init);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
}

describe('ApiClient', () => {
  it('sends auth, tenant and idempotency headers', async () => {
    const fetchImpl = mockFetch((_u, init) => {
      const h = init.headers as Record<string, string>;
      expect(h.Authorization).toBe('Bearer tok');
      expect(h['X-Organization-Id']).toBe('org-1');
      expect(h['Idempotency-Key']).toBe('key-1');
      return { status: 201, body: { id: 's1' } };
    });
    const c = new ApiClient({ baseUrl: '/api/v1', getAccessToken: () => 'tok', setAccessToken: () => {}, getOrganizationId: () => 'org-1', refresh: async () => null, fetchImpl });
    expect(await c.sales.create({}, 'key-1')).toEqual({ id: 's1' });
  });

  it('refreshes once on 401 and retries, even for concurrent calls', async () => {
    let token = 'old';
    const refresh = vi.fn(async () => 'new');
    const fetchImpl = mockFetch((_u, init) => {
      const h = init.headers as Record<string, string>;
      return h.Authorization === 'Bearer new' ? { status: 200, body: { ok: true } } : { status: 401, body: { code: 'UNAUTHENTICATED' } };
    });
    const c = new ApiClient({ baseUrl: '', getAccessToken: () => token, setAccessToken: (t) => (token = t!), getOrganizationId: () => null, refresh, fetchImpl });
    const [a, b] = await Promise.all([c.me.get(), c.me.get()]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('maps API errors to ApiError with the stable code', async () => {
    const onAuthFailure = vi.fn();
    const fetchImpl = mockFetch(() => ({ status: 422, body: { code: 'INSUFFICIENT_STOCK', details: { available: '0.000' } } }));
    const c = new ApiClient({ baseUrl: '', getAccessToken: () => null, setAccessToken: () => {}, getOrganizationId: () => null, refresh: async () => null, fetchImpl, onAuthFailure });
    await expect(c.inventory.adjust({})).rejects.toMatchObject({ status: 422, code: 'INSUFFICIENT_STOCK' });
    const err = await c.inventory.adjust({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
  });

  it('reports network failures as NETWORK', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fail');
    }) as unknown as typeof fetch;
    const c = new ApiClient({ baseUrl: '', getAccessToken: () => null, setAccessToken: () => {}, getOrganizationId: () => null, refresh: async () => null, fetchImpl });
    await expect(c.me.get()).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});
