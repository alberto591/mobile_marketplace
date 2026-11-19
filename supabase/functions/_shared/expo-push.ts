// Expo Push Notification helper for Supabase Edge Functions.
// Sends shipment alerts via https://exp.host/--/api/v2/push/send without requiring
// native Firebase/APNs SDKs on the server.

export const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  readonly to: string;
  readonly title: string;
  readonly body: string;
  readonly sound?: 'default';
  readonly data?: Record<string, string>;
}

export type PushSender = (messages: readonly ExpoPushMessage[]) => Promise<{
  readonly ok: boolean;
  readonly error?: string;
}>;

export async function defaultExpoPushSender(
  messages: readonly ExpoPushMessage[],
  fetchFn: typeof fetch = fetch
): Promise<{ readonly ok: boolean; readonly error?: string }> {
  if (messages.length === 0) return { ok: true };
  try {
    const res = await fetchFn(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `Expo Push HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildOrderShippedPushMessages(params: {
  readonly tokens: readonly string[];
  readonly orderReference: string;
  readonly carrier: string;
  readonly trackingNumber: string;
}): readonly ExpoPushMessage[] {
  const uniqueTokens = Array.from(
    new Set(
      params.tokens
        .map((t) => t.trim())
        .filter((t) => /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,128}\]$/.test(t))
    )
  );

  return uniqueTokens.map((to) => ({
    to,
    sound: 'default',
    title: `Pedido ${params.orderReference} enviado`,
    body: `Enviado con ${params.carrier} · Seguimiento: ${params.trackingNumber}`,
    data: {
      type: 'ORDER_SHIPPED',
      orderReference: params.orderReference,
      carrier: params.carrier,
      trackingNumber: params.trackingNumber,
    },
  }));
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/**
 * Looks up any Expo push tokens registered for the suborder's parent order and
 * delivers a shipment notification. Never throws so shipment confirmation cannot fail.
 */
export async function notifyBuyerShippedPush(params: {
  readonly supabase: SupabaseLike;
  readonly suborderId: string;
  readonly pushSender?: PushSender;
}): Promise<'SENT' | 'NO_TOKENS' | 'FAILED'> {
  const { supabase, suborderId } = params;
  try {
    const { data: sub, error: subErr } = await supabase
      .from('order_suborders')
      .select('order_id, shipping_carrier, tracking_number, orders ( order_reference )')
      .eq('id', suborderId)
      .single();

    if (subErr || !sub?.order_id) return 'FAILED';

    const { data: tokenRows, error: tokErr } = await supabase
      .from('order_push_tokens')
      .select('expo_push_token')
      .eq('order_id', sub.order_id);

    if (tokErr) return 'FAILED';

    // deno-lint-ignore no-explicit-any
    const tokens = (tokenRows ?? []).map((r: any) => String(r.expo_push_token ?? ''));
    const messages = buildOrderShippedPushMessages({
      tokens,
      orderReference: sub.orders?.order_reference ?? 'tu pedido',
      carrier: sub.shipping_carrier ?? 'mensajería',
      trackingNumber: sub.tracking_number ?? '',
    });

    if (messages.length === 0) return 'NO_TOKENS';

    const sender = params.pushSender ?? defaultExpoPushSender;
    const result = await sender(messages);
    return result.ok ? 'SENT' : 'FAILED';
  } catch {
    return 'FAILED';
  }
}
