import type { SubmitInquiryResponse } from '@mobile-marketplace/core';

export interface SubmitInquiryRequest {
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  readonly customerMessage?: string;
  readonly vehicleVin?: string;
  readonly vehiclePlate?: string;
  readonly items: ReadonlyArray<{ readonly partId: string }>;
  readonly privacyConsent: {
    readonly accepted: true;
    readonly version: string;
  };
  readonly idempotencyKey: string;
}

export class InquiryError extends Error {
  readonly statusCode?: number;
  readonly errorDetails?: unknown;

  constructor(message: string, options?: { statusCode?: number; details?: unknown }) {
    super(`[InquiryError]: ${message}`);
    this.name = 'InquiryError';
    this.statusCode = options?.statusCode;
    this.errorDetails = options?.details;
  }
}

export interface IInquiryService {
  submitInquiry(request: SubmitInquiryRequest): Promise<SubmitInquiryResponse>;
}

export class InquiryService implements IInquiryService {
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
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async submitInquiry(request: SubmitInquiryRequest): Promise<SubmitInquiryResponse> {
    const url = `${this.baseUrl}/functions/v1/submit-inquiry`;
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
        throw new InquiryError(
          `Respuesta no válida del servidor de consultas (HTTP ${response.status})`,
          { statusCode: response.status }
        );
      }

      if (!response.ok) {
        throw new InquiryError(
          responseData?.message || responseData?.error || `Error al tramitar la consulta (HTTP ${response.status})`,
          {
            statusCode: response.status,
            details: responseData,
          }
        );
      }

      return responseData as SubmitInquiryResponse;
    } catch (err: any) {
      if (err instanceof InquiryError) throw err;
      if (err?.name === 'AbortError') {
        throw new InquiryError('Tiempo de espera agotado al enviar la solicitud', {
          statusCode: 504,
        });
      }
      throw new InquiryError(
        err?.message || 'Error de conexión al tramitar la consulta comercial',
        { details: err }
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export const inquiryService = new InquiryService();
