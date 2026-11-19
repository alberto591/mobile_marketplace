/**
 * Client of the vendor-order Edge Function: the seller page that lets a scrapyard see a
 * paid order and mark it as shipped. Authorised by the action token from the seller's
 * "order paid" email; the token is sent in the request body, never in a URL.
 */

export interface VendorOrderItem {
  readonly title: string;
  readonly externalPartId: string;
  readonly unitPriceCents: number;
}

export interface VendorOrder {
  readonly suborderReference: string;
  readonly orderReference: string;
  readonly isTestOrder: boolean;
  readonly vendorTradeName: string;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly currency: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly platformFeeCents: number;
  readonly sellerNetCents: number;
  readonly shippingCarrier: string | null;
  readonly trackingNumber: string | null;
  readonly shippedAt: string | null;
  readonly customer: { readonly name: string; readonly phone: string };
  readonly shippingAddress: {
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
    readonly province: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly items: readonly VendorOrderItem[];
}

export class VendorOrderError extends Error {
  readonly code: string;
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'VendorOrderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Extracts the action token from the page location. The email link carries it in the
 * fragment (#token=...), which is not sent to the web host; ?token=... is accepted too.
 */
export function extractVendorToken(location: { hash?: string | null; search?: string | null }): string | null {
  for (const part of [location.hash, location.search]) {
    if (!part) continue;
    const params = new URLSearchParams(part.replace(/^[#?]/, ''));
    const token = (params.get('token') ?? '').trim().toLowerCase();
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return null;
}

export class VendorOrderService {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: { baseUrl?: string; anonKey?: string; timeoutMs?: number; fetchFn?: typeof fetch } = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/+$/, '');
    this.anonKey = options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  getOrder(token: string): Promise<VendorOrder> {
    return this.call({ token, action: 'get' });
  }

  markShipped(token: string, carrier: string, trackingNumber: string): Promise<VendorOrder> {
    return this.call({ token, action: 'ship', carrier: carrier.trim(), trackingNumber: trackingNumber.trim() });
  }

  private async call(body: Record<string, unknown>): Promise<VendorOrder> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/functions/v1/vendor-order`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new VendorOrderError(`Respuesta no válida del servidor (HTTP ${response.status})`, 'INVALID_RESPONSE', response.status);
      }

      if (!response.ok || !data?.success || !data.order) {
        throw new VendorOrderError(
          data?.message || 'No se pudo completar la operación.',
          typeof data?.error === 'string' ? data.error : 'UNKNOWN',
          response.status
        );
      }
      return data.order as VendorOrder;
    } catch (err: any) {
      if (err instanceof VendorOrderError) throw err;
      if (err?.name === 'AbortError') {
        throw new VendorOrderError('El servidor tarda demasiado en responder. Inténtalo de nuevo.', 'TIMEOUT', 504);
      }
      throw new VendorOrderError('Sin conexión con el servidor. Comprueba tu red e inténtalo de nuevo.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }
}

export const vendorOrderService = new VendorOrderService();
