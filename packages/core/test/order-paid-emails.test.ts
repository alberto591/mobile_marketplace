import { describe, expect, it, vi } from 'vitest';
import {
  buildBuyerOrderEmail,
  buildSellerOrderEmail,
  formatCents,
  sendOrderPaidNotifications,
  type OrderEmailConfig,
} from '../../../supabase/functions/_shared/order-emails.js';

const suborderRow = {
  id: 'sub-1',
  suborder_reference: 'ORD-202611-AB12-01',
  currency: 'EUR',
  subtotal_cents: 4500,
  shipping_cents: 950,
  tax_cents: 0,
  total_cents: 5450,
  platform_fee_cents: 450,
  seller_net_cents: 5000,
  orders: {
    order_reference: 'ORD-202611-AB12',
    is_test_order: false,
    customer_name: 'Ana <script>alert(1)</script>',
    customer_email: 'ana@example.com',
    customer_phone: '600111222',
    shipping_address_line1: 'Calle Larios 1',
    shipping_address_line2: null,
    shipping_city: 'Málaga',
    shipping_province: 'Málaga',
    shipping_postal_code: '29005',
    shipping_country: 'ES',
  },
  vendors: { trade_name: 'Eurodesguace Málaga', public_email: 'ventas@desguace.example', public_phone: '952000000' },
  order_items: [{ title: 'Faro <b>izquierdo</b>', external_part_id: 'EDM-101', unit_price_cents: 4500 }],
};

/** Minimal stand-in for the supabase-js query builder used by the module. */
function fakeSupabase(options: { existing?: any[]; row?: any } = {}) {
  const upserts: any[] = [];
  const supabase = {
    from(table: string) {
      if (table === 'order_suborders') {
        const q: any = { select: () => q, eq: () => q, single: async () => ({ data: options.row ?? suborderRow, error: null }) };
        return q;
      }
      const q: any = {
        select: () => q,
        eq: () => q,
        then: (resolve: any) => resolve({ data: options.existing ?? [], error: null }),
        upsert: async (row: any) => {
          upserts.push(row);
          return { error: null };
        },
      };
      return q;
    },
  };
  return { supabase, upserts };
}

const liveConfig: OrderEmailConfig = {
  resendApiKey: 're_test',
  fromEmail: 'pedidos@buscapiezas.example',
  testMode: false,
  sellerFallbackEmail: 'fallback@buscapiezas.example',
};

describe('Order paid emails', () => {
  it('formats integer cents without floating point', () => {
    expect(formatCents(5450, 'EUR')).toBe('54,50 EUR');
    expect(formatCents(5, 'EUR')).toBe('0,05 EUR');
    expect(formatCents(100000, 'EUR')).toBe('1000,00 EUR');
  });

  it('sends one email to the seller and one to the buyer and logs both as SENT', async () => {
    const { supabase, upserts } = fakeSupabase();
    const sender = vi.fn(async () => ({ success: true, messageId: 'msg_1' }));

    const outcomes = await sendOrderPaidNotifications({ supabase, suborderId: 'sub-1', config: liveConfig, sender });

    expect(sender).toHaveBeenCalledTimes(2);
    const [sellerMail, buyerMail] = sender.mock.calls.map((c: any[]) => c[0]);
    expect(sellerMail.to).toBe('ventas@desguace.example');
    expect(sellerMail.subject).toContain('ORD-202611-AB12-01');
    expect(sellerMail.html).toContain('50,00 EUR'); // seller net
    expect(sellerMail.html).toContain('Calle Larios 1');
    expect(buyerMail.to).toBe('ana@example.com');
    expect(buyerMail.html).toContain('54,50 EUR');
    expect(buyerMail.html).not.toContain('Comisión'); // the buyer never sees the platform fee

    expect(outcomes.map((o) => `${o.audience}:${o.status}`)).toEqual(['SELLER:SENT', 'BUYER:SENT']);
    expect(upserts.map((u) => `${u.audience}:${u.status}:${u.attempt_count}`)).toEqual(['SELLER:SENT:1', 'BUYER:SENT:1']);
  });

  it('escapes customer and catalog text in both emails', async () => {
    const { supabase } = fakeSupabase();
    const sender = vi.fn(async () => ({ success: true }));
    await sendOrderPaidNotifications({ supabase, suborderId: 'sub-1', config: liveConfig, sender });

    for (const [mail] of sender.mock.calls as any[][]) {
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).not.toContain('<b>izquierdo</b>');
      expect(mail.html).toContain('Faro &lt;b&gt;izquierdo&lt;/b&gt;');
    }
  });

  it('never re-sends a notification that was already sent (webhook retry)', async () => {
    const { supabase, upserts } = fakeSupabase({
      existing: [
        { audience: 'SELLER', status: 'SENT', attempt_count: 1 },
        { audience: 'BUYER', status: 'FAILED', attempt_count: 1 },
      ],
    });
    const sender = vi.fn(async () => ({ success: true }));

    const outcomes = await sendOrderPaidNotifications({ supabase, suborderId: 'sub-1', config: liveConfig, sender });

    expect(sender).toHaveBeenCalledTimes(1);
    expect((sender.mock.calls[0] as any[])[0].to).toBe('ana@example.com');
    expect(outcomes.map((o) => `${o.audience}:${o.status}`)).toEqual(['SELLER:ALREADY_SENT', 'BUYER:SENT']);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].attempt_count).toBe(2);
  });

  it('in test mode redirects every email to the test recipient and labels it', async () => {
    const { supabase } = fakeSupabase();
    const sender = vi.fn(async () => ({ success: true }));
    await sendOrderPaidNotifications({
      supabase,
      suborderId: 'sub-1',
      config: { ...liveConfig, testMode: true, testRecipientEmail: 'qa@buscapiezas.example' },
      sender,
    });

    for (const [mail] of sender.mock.calls as any[][]) {
      expect(mail.to).toBe('qa@buscapiezas.example');
      expect(mail.subject.startsWith('[PRUEBA] ')).toBe(true);
      expect(mail.html).toContain('PEDIDO DE PRUEBA');
    }
  });

  it('records SKIPPED_NOT_CONFIGURED instead of sending when email is not set up', async () => {
    const { supabase, upserts } = fakeSupabase();
    const outcomes = await sendOrderPaidNotifications({
      supabase,
      suborderId: 'sub-1',
      config: { testMode: true },
    });

    expect(outcomes.every((o) => o.status === 'SKIPPED_NOT_CONFIGURED')).toBe(true);
    expect(upserts.every((u) => u.status === 'SKIPPED_NOT_CONFIGURED' && u.attempt_count === 0)).toBe(true);
  });

  it('falls back to the configured seller address when the vendor has no email', async () => {
    const { supabase } = fakeSupabase({ row: { ...suborderRow, vendors: { trade_name: 'Desguace X', public_email: null, public_phone: null } } });
    const sender = vi.fn(async () => ({ success: true }));
    await sendOrderPaidNotifications({ supabase, suborderId: 'sub-1', config: liveConfig, sender });
    expect((sender.mock.calls[0] as any[])[0].to).toBe('fallback@buscapiezas.example');
  });

  it('reports a provider failure without throwing', async () => {
    const { supabase, upserts } = fakeSupabase();
    const sender = vi.fn(async () => { throw new Error('resend down'); });
    const outcomes = await sendOrderPaidNotifications({ supabase, suborderId: 'sub-1', config: liveConfig, sender });

    expect(outcomes.map((o) => o.status)).toEqual(['FAILED', 'FAILED']);
    expect(outcomes[0].error).toContain('resend down');
    expect(upserts.every((u) => u.status === 'FAILED')).toBe(true);
  });

  it('keeps subjects on a single line', () => {
    const order = {
      suborderId: 's', orderReference: 'ORD-1\r\nBcc: x@y.z', suborderReference: 'ORD-1-01', isTestOrder: false, currency: 'EUR',
      subtotalCents: 1, shippingCents: 0, taxCents: 0, totalCents: 1, platformFeeCents: 0, sellerNetCents: 1,
      customer: { name: 'A', email: 'a@b.c', phone: '1' },
      shipping: { line1: 'x', line2: null, city: 'c', province: 'p', postalCode: '29001', country: 'ES' },
      vendor: { tradeName: 'V', email: null, phone: null }, items: [],
    };
    expect(buildBuyerOrderEmail(order, liveConfig, null).subject).not.toMatch(/[\r\n]/);
    expect(buildSellerOrderEmail(order, liveConfig, null).subject).not.toMatch(/[\r\n]/);
  });
});
