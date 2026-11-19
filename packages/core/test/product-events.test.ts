import { describe, expect, it, vi } from 'vitest';
import { buildServerEventRow, recordServerEvent } from '../../../supabase/functions/_shared/product-events';

describe('Server product events helper', () => {
  it('builds a normalized server event row for product_events', () => {
    expect(
      buildServerEventRow({
        eventName: 'purchase_completed',
        vendorId: 'vendor-1',
        orderId: 'order-1',
        amountCents: 12550,
        metadata: { paymentIntentId: 'pi_123' },
      })
    ).toEqual({
      event_name: 'purchase_completed',
      platform: 'server',
      part_id: null,
      vendor_id: 'vendor-1',
      order_id: 'order-1',
      amount_cents: 12550,
      metadata: { paymentIntentId: 'pi_123' },
    });
  });

  it('inserts server-side conversion events into product_events', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    const ok = await recordServerEvent(supabase, {
      eventName: 'checkout_started',
      vendorId: 'vendor-1',
      orderId: 'order-1',
      amountCents: 4990,
      metadata: { itemCount: 1 },
    });

    expect(ok).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('product_events');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('swallows DB errors so telemetry never breaks payments or inquiries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = {
      from: () => ({
        insert: async () => ({ error: { message: 'db temporarily unavailable' } }),
      }),
    };

    const ok = await recordServerEvent(supabase, {
      eventName: 'inquiry_submitted',
      vendorId: 'vendor-1',
    });

    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
