import { describe, expect, it, vi } from 'vitest';
import { extractVendorToken, VendorOrderError, VendorOrderService } from '../services/vendor-order.service';

const TOKEN = 'ab'.repeat(32);

describe('Seller page client', () => {
  it('reads the token from the URL fragment or, failing that, the query string', () => {
    expect(extractVendorToken({ hash: `#token=${TOKEN}` })).toBe(TOKEN);
    expect(extractVendorToken({ hash: '', search: `?token=${TOKEN.toUpperCase()}` })).toBe(TOKEN);
    expect(extractVendorToken({ hash: '#token=short', search: null })).toBeNull();
    expect(extractVendorToken({})).toBeNull();
  });

  it('sends the token in the request body, never in the URL', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, order: { suborderReference: 'X' } }) }));
    const service = new VendorOrderService({ baseUrl: 'https://proj.supabase.co/', anonKey: 'anon', fetchFn: fetchFn as any });

    await service.markShipped(TOKEN, ' SEUR ', ' SE123 ');

    const [url, init] = fetchFn.mock.calls[0] as any[];
    expect(url).toBe('https://proj.supabase.co/functions/v1/vendor-order');
    expect(url).not.toContain(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, action: 'ship', carrier: 'SEUR', trackingNumber: 'SE123' });
  });

  it('surfaces the server message and code on failure', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: 'NOT_PAID', message: 'Este pedido no está pagado.' }),
    }));
    const service = new VendorOrderService({ baseUrl: 'https://x', anonKey: 'anon', fetchFn: fetchFn as any });

    const err = await service.getOrder(TOKEN).catch((e) => e);
    expect(err).toBeInstanceOf(VendorOrderError);
    expect(err.code).toBe('NOT_PAID');
    expect(err.message).toBe('Este pedido no está pagado.');
  });

  it('reports network failures in plain language', async () => {
    const service = new VendorOrderService({ baseUrl: 'https://x', anonKey: 'anon', fetchFn: (async () => { throw new Error('fetch failed'); }) as any });
    const err = await service.getOrder(TOKEN).catch((e) => e);
    expect(err.code).toBe('NETWORK');
  });
});
