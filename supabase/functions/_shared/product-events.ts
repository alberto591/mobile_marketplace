// Records server-side product funnel events into `product_events`.
// Dependency-free so it runs in Supabase Edge Functions (Deno) and unit tests.
// Telemetry failures are logged and swallowed so they never break an inquiry or payment.

export type ServerProductEventName =
  | 'inquiry_submitted'
  | 'checkout_started'
  | 'purchase_completed';

export interface ServerProductEvent {
  readonly eventName: ServerProductEventName;
  readonly partId?: string | null;
  readonly vendorId?: string | null;
  readonly orderId?: string | null;
  readonly amountCents?: number | null;
  readonly metadata?: Record<string, unknown>;
}

export interface ProductEventsTableWriter {
  from: (table: string) => {
    insert?: (row: Record<string, unknown>) => PromiseLike<{ error?: { message?: string } | null }> | { error?: { message?: string } | null };
  };
}

export function buildServerEventRow(event: ServerProductEvent): Record<string, unknown> {
  const amount =
    typeof event.amountCents === 'number' && Number.isFinite(event.amountCents) && event.amountCents >= 0
      ? Math.round(event.amountCents)
      : null;

  return {
    event_name: event.eventName,
    platform: 'server',
    part_id: event.partId ?? null,
    vendor_id: event.vendorId ?? null,
    order_id: event.orderId ?? null,
    amount_cents: amount,
    metadata: event.metadata ?? {},
  };
}

export async function recordServerEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  event: ServerProductEvent
): Promise<boolean> {
  try {
    if (!supabase || typeof supabase.from !== 'function') return false;
    const table = supabase.from('product_events');
    if (!table || typeof table.insert !== 'function') return false;

    const row = buildServerEventRow(event);
    const result = await table.insert(row);
    if (result?.error) {
      console.warn('[product-events] Failed to record server event', {
        eventName: event.eventName,
        error: result.error.message ?? String(result.error),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[product-events] Unexpected error recording server event', {
      eventName: event.eventName,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
