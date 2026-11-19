/**
 * Links to the buyer's order screen.
 *
 * The order access token is a bearer secret. On native it travels as an in-memory route
 * param. On web a route param would become `?token=…` in the address bar, and from there
 * end up in server logs, browser history sync and Referer headers; so on web it goes in
 * the URL fragment (`#token=…`), which browsers never send to any server. The seller page
 * (/vendor/order) uses the same scheme.
 */

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type OrderHref =
  | string
  | { pathname: '/order/[reference]'; params: { reference: string; token: string; orderedPartIds?: string } };

export function buildOrderHref(
  order: { reference: string; accessToken: string; orderedPartIds?: readonly string[] },
  platform: string
): OrderHref {
  const orderedPartIds =
    order.orderedPartIds && order.orderedPartIds.length > 0 ? JSON.stringify(order.orderedPartIds) : undefined;

  if (platform !== 'web') {
    return {
      pathname: '/order/[reference]',
      params: {
        reference: order.reference,
        token: order.accessToken,
        ...(orderedPartIds ? { orderedPartIds } : {}),
      },
    };
  }

  const query = orderedPartIds ? `?orderedPartIds=${encodeURIComponent(orderedPartIds)}` : '';
  return `/order/${encodeURIComponent(order.reference)}${query}#token=${encodeURIComponent(order.accessToken)}`;
}

/**
 * Finds the access token for the order screen: the fragment first (web links), then the
 * route param (native navigation, and web links created before tokens moved to the fragment).
 */
export function extractOrderToken(sources: { hash?: string | null; paramToken?: string | null }): string | null {
  if (sources.hash) {
    const fromHash = (new URLSearchParams(sources.hash.replace(/^#/, '')).get('token') ?? '').trim().toLowerCase();
    if (TOKEN_PATTERN.test(fromHash)) return fromHash;
  }
  const fromParam = (sources.paramToken ?? '').trim().toLowerCase();
  return TOKEN_PATTERN.test(fromParam) ? fromParam : null;
}
