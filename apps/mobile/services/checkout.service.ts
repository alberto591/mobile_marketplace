export interface CheckoutAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  readonly country: 'ES';
}

export interface CheckoutContact {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
}

export interface CreatePaymentIntentRequest {
  readonly contact: CheckoutContact;
  readonly address: CheckoutAddress;
  readonly partIds: readonly string[];
  readonly idempotencyKey: string;
}

export interface CheckoutPricingResponse {
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly platformFeeCents: number;
  readonly isTestOrder: boolean;
  readonly taxStatus: string;
}

export interface CreatePaymentIntentResponse {
  readonly success: boolean;
  readonly orderReference: string;
  readonly suborderReference: string;
  readonly accessToken: string;
  readonly clientSecret: string | null;
  readonly stripeAccountId: string;
  readonly publishableKey: string | null;
  readonly pricing: CheckoutPricingResponse;
  readonly status: string;
}

export interface OrderItemDetail {
  readonly partId: string;
  readonly externalPartId: string;
  readonly title: string;
  readonly oemReference?: string;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

export interface SuborderDetail {
  readonly suborderReference: string;
  readonly vendorId: string;
  readonly vendorTradeName: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly totalCents: number;
  readonly paymentStatus: string;
  readonly fulfillmentStatus: string;
  readonly shippingCarrier?: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly items: readonly OrderItemDetail[];
}

export interface OrderDetail {
  readonly orderReference: string;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly shippingAddress: {
    readonly line1: string;
    readonly line2?: string;
    readonly city: string;
    readonly province: string;
    readonly postalCode: string;
    readonly country: string;
  };
  readonly currency: string;
  readonly totalProductsCents: number;
  readonly totalShippingCents: number;
  readonly totalTaxCents: number;
  readonly totalOrderCents: number;
  readonly taxStatus: string;
  readonly status: string;
  readonly isTestOrder: boolean;
  readonly createdAt: string;
  readonly suborders: readonly SuborderDetail[];
}

export class CheckoutError extends Error {
  readonly statusCode?: number;
  readonly errorDetails?: unknown;

  constructor(message: string, options?: { statusCode?: number; details?: unknown }) {
    super(`[CheckoutError]: ${message}`);
    this.name = 'CheckoutError';
    this.statusCode = options?.statusCode;
    this.errorDetails = options?.details;
  }
}

export interface ICheckoutService {
  createPaymentIntent(request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse>;
  getOrderByAccessToken(accessToken: string): Promise<OrderDetail | null>;
}

export class CheckoutService implements ICheckoutService {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    baseUrl?: string;
    anonKey?: string;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  } = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      'http://127.0.0.1:54321'
    ).replace(/\/+$/, '');
    this.anonKey =
      options.anonKey ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      '';
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<CreatePaymentIntentResponse> {
    const url = `${this.baseUrl}/functions/v1/create-payment-intent`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      let responseData: any;
      try {
        responseData = await response.json();
      } catch {
        throw new CheckoutError(
          `Respuesta no válida del servidor de pagos (HTTP ${response.status})`,
          { statusCode: response.status }
        );
      }

      if (!response.ok) {
        throw new CheckoutError(
          responseData?.message || responseData?.error || `Error al iniciar el pago (HTTP ${response.status})`,
          {
            statusCode: response.status,
            details: responseData,
          }
        );
      }

      return responseData as CreatePaymentIntentResponse;
    } catch (err: any) {
      if (err instanceof CheckoutError) throw err;
      if (err?.name === 'AbortError') {
        throw new CheckoutError('Tiempo de espera agotado al conectar con la pasarela de pagos', {
          statusCode: 504,
        });
      }
      throw new CheckoutError(
        err?.message || 'Error de conexión al iniciar el checkout',
        { details: err }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getOrderByAccessToken(accessToken: string): Promise<OrderDetail | null> {
    const url = `${this.baseUrl}/rest/v1/rpc/get_order_by_access_token`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p_access_token: accessToken }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return (data as OrderDetail) ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const checkoutService = new CheckoutService();
