import { describe, expect, it, vi } from 'vitest';
import { buildSellerOrderEmail, vendorOrderLink } from '../../../supabase/functions/_shared/order-emails.js';
import { handleVendorOrderRequest } from '../../../supabase/functions/_shared/vendor-order.js';

const TOKEN = 'ab'.repeat(32);
const emailConfig = { resendApiKey: 're_test', fromEmail: 'pedidos@buscapiezas.example', testMode: false };

const orderView = {
  suborderReference: 'ORD-202611-AB12-01',
  fulfillmentStatus: 'SHIPPED',
  shippingCarrier: 'SEUR',
  trackingNumber: 'SE123456789',
};

function fakeSupabase(options: { shipResult?: any; order?: any; notifications?: any[] } = {}) {
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  const upserts: any[] = [];
  const supabase = {
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      if (fn === 'vendor_mark_suborder_shipped') {
        return { data: options.shipResult ?? { ok: true, firstShipment: true, suborderId: 'sub-1' }, error: null };
      }
      return { data: 'order' in options ? options.order : orderView, error: null };
    },
    from(table: string) {
      if (table === 'order_suborders') {
        const q: any = {
          select: () => q,
          eq: () => q,
          single: async () => ({
            data: {
              shipping_carrier: 'SEUR',
              tracking_number: 'SE123456789',
              orders: { order_reference: 'ORD-202611-AB12', is_test_order: false, customer_name: 'Ana <b>', customer_email: 'ana@example.com' },
              vendors: { trade_name: 'Eurodesguace Málaga' },
              order_items: [{ title: 'Faro', external_part_id: 'EDM-101' }],
            },
            error: null,
          }),
        };
        return q;
      }
      const q: any = {
        select: () => q,
        eq: () => q,
        then: (resolve: any) => resolve({ data: options.notifications ?? [], error: null }),
        upsert: async (row: any) => {
          upserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
  return { supabase, rpcCalls, upserts };
}

describe('Seller order page backend', () => {
  it('rejects malformed tokens without touching the database', async () => {
    const { supabase, rpcCalls } = fakeSupabase();
    for (const token of [undefined, '', 'short', 'z'.repeat(64), `${TOKEN}0`]) {
      const res = await handleVendorOrderRequest({ supabase, payload: { token, action: 'get' }, emailConfig });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('INVALID_LINK');
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it('gives the same answer for an unknown token as for a malformed one', async () => {
    const { supabase } = fakeSupabase({ order: null });
    const res = await handleVendorOrderRequest({ supabase, payload: { token: TOKEN, action: 'get' }, emailConfig });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('INVALID_LINK');
  });

  it('returns the order for a valid token', async () => {
    const { supabase, rpcCalls } = fakeSupabase();
    const res = await handleVendorOrderRequest({ supabase, payload: { token: TOKEN.toUpperCase() }, emailConfig });
    expect(res.status).toBe(200);
    expect(res.body.order).toEqual(orderView);
    expect(rpcCalls).toEqual([{ fn: 'vendor_get_suborder', args: { p_token: TOKEN } }]);
  });

  it('validates carrier and tracking number before writing', async () => {
    const { supabase, rpcCalls } = fakeSupabase();
    const bad = [
      { carrier: '', trackingNumber: 'SE123' },
      { carrier: 'SEUR', trackingNumber: '' },
      { carrier: 'SEUR', trackingNumber: '<script>' },
      { carrier: 'SEUR\nBcc: x', trackingNumber: 'SE123' },
      { carrier: 'S'.repeat(81), trackingNumber: 'SE123' },
    ];
    for (const b of bad) {
      const res = await handleVendorOrderRequest({ supabase, payload: { token: TOKEN, action: 'ship', ...b }, emailConfig });
      expect(res.status).toBe(400);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it('marks as shipped and emails the buyer the tracking number once', async () => {
    const { supabase, rpcCalls, upserts } = fakeSupabase();
    const sender = vi.fn(async () => ({ success: true, messageId: 'm1' }));

    const res = await handleVendorOrderRequest({
      supabase,
      payload: { token: TOKEN, action: 'ship', carrier: ' SEUR ', trackingNumber: ' SE123456789 ' },
      emailConfig,
      sender,
    });

    expect(res.status).toBe(200);
    expect(res.body.buyerNotification).toBe('SENT');
    expect(rpcCalls[0]).toEqual({
      fn: 'vendor_mark_suborder_shipped',
      args: { p_token: TOKEN, p_carrier: 'SEUR', p_tracking_number: 'SE123456789' },
    });

    expect(sender).toHaveBeenCalledTimes(1);
    const mail = (sender.mock.calls[0] as any[])[0];
    expect(mail.to).toBe('ana@example.com');
    expect(mail.html).toContain('SE123456789');
    expect(mail.html).toContain('Ana &lt;b&gt;');
    expect(mail.html).not.toContain(TOKEN); // the seller token never reaches the buyer
    expect(upserts[0]).toMatchObject({ kind: 'ORDER_SHIPPED', audience: 'BUYER', status: 'SENT' });
  });

  it('does not email again when the seller only corrects the tracking data', async () => {
    const { supabase } = fakeSupabase({ shipResult: { ok: true, firstShipment: false, suborderId: 'sub-1' } });
    const sender = vi.fn(async () => ({ success: true }));
    const res = await handleVendorOrderRequest({
      supabase,
      payload: { token: TOKEN, action: 'ship', carrier: 'MRW', trackingNumber: 'MRW-999' },
      emailConfig,
      sender,
    });
    expect(res.status).toBe(200);
    expect(sender).not.toHaveBeenCalled();
    expect(res.body.buyerNotification).toBeUndefined();
  });

  it('refuses to ship unpaid, refunded or closed orders', async () => {
    for (const [error, status] of [['NOT_PAID', 409], ['NOT_SHIPPABLE', 409], ['NOT_FOUND', 404]] as const) {
      const { supabase } = fakeSupabase({ shipResult: { ok: false, error } });
      const sender = vi.fn(async () => ({ success: true }));
      const res = await handleVendorOrderRequest({
        supabase,
        payload: { token: TOKEN, action: 'ship', carrier: 'SEUR', trackingNumber: 'SE123' },
        emailConfig,
        sender,
      });
      expect(res.status).toBe(status);
      expect(sender).not.toHaveBeenCalled();
    }
  });

  it('still records the shipment when the buyer email fails', async () => {
    const { supabase } = fakeSupabase();
    const sender = vi.fn(async () => ({ success: false, error: 'resend down' }));
    const res = await handleVendorOrderRequest({
      supabase,
      payload: { token: TOKEN, action: 'ship', carrier: 'SEUR', trackingNumber: 'SE123' },
      emailConfig,
      sender,
    });
    expect(res.status).toBe(200);
    expect(res.body.buyerNotification).toBe('FAILED');
  });
});

describe('Seller link in the order email', () => {
  it('puts the token in the URL fragment and only for a valid base URL and token', () => {
    expect(vendorOrderLink('https://app.example.com/', TOKEN)).toBe(`https://app.example.com/vendor/order#token=${TOKEN}`);
    expect(vendorOrderLink(undefined, TOKEN)).toBeNull();
    expect(vendorOrderLink('javascript:alert(1)', TOKEN)).toBeNull();
    expect(vendorOrderLink('https://app.example.com', 'not-a-token')).toBeNull();
  });

  it('includes the button for the seller only when the portal URL is configured', () => {
    const order = {
      suborderId: 's', orderReference: 'ORD-1', suborderReference: 'ORD-1-01', isTestOrder: false, currency: 'EUR',
      subtotalCents: 1, shippingCents: 0, taxCents: 0, totalCents: 1, platformFeeCents: 0, sellerNetCents: 1,
      customer: { name: 'A', email: 'a@b.c', phone: '1' },
      shipping: { line1: 'x', line2: null, city: 'c', province: 'p', postalCode: '29001', country: 'ES' },
      vendor: { tradeName: 'V', email: null, phone: null }, items: [], vendorActionToken: TOKEN,
    };
    const withPortal = buildSellerOrderEmail(order, { testMode: false, vendorPortalBaseUrl: 'https://app.example.com' }, null);
    expect(withPortal.html).toContain(`https://app.example.com/vendor/order#token=${TOKEN}`);
    expect(buildSellerOrderEmail(order, { testMode: false }, null).html).not.toContain('Marcar como enviado');
  });
});
