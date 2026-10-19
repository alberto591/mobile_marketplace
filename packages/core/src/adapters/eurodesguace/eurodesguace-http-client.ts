import type {
  EurodesguaceHealthResponse,
  EurodesguacePartDetailResponse,
  EurodesguacePartsResponse,
} from './eurodesguace.types.js';
import {
  EurodesguaceHealthResponseSchema,
  EurodesguacePartDetailResponseSchema,
  EurodesguacePartsResponseSchema,
} from './eurodesguace.types.js';

export interface EurodesguaceClientConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly fetchFn?: typeof fetch;
}

export class EurodesguaceHttpError extends Error {
  readonly statusCode: number;
  readonly errorType: string;
  readonly retryAfterSeconds?: number;
  readonly requestId?: string;

  constructor(params: {
    message: string;
    statusCode: number;
    errorType: string;
    retryAfterSeconds?: number;
    requestId?: string;
  }) {
    super(`[EurodesguaceHttpError ${params.statusCode}] ${params.errorType}: ${params.message}`);
    this.name = 'EurodesguaceHttpError';
    this.statusCode = params.statusCode;
    this.errorType = params.errorType;
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.requestId = params.requestId;
  }
}

export interface GetPartsQueryParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly fields?: string;
  readonly q?: string;
  readonly updatedSince?: string;
  readonly includeDeleted?: boolean;
  readonly marca?: string;
  readonly modelo?: string;
  readonly familia?: string;
  readonly articulo?: string;
  readonly codvehiculo?: string;
  readonly refvisual?: string;
  readonly estado?: string;
}

export class EurodesguaceHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetch: typeof fetch;

  constructor(config: EurodesguaceClientConfig) {
    if (!config.baseUrl) {
      throw new Error('Eurodesguace baseUrl is required');
    }
    if (!config.apiKey) {
      throw new Error('Eurodesguace apiKey is required');
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.timeoutMs = config.timeoutMs ?? 10000;
    this.maxRetries = config.maxRetries ?? 3;
    this.fetch = config.fetchFn ?? globalThis.fetch;
  }

  /**
   * Health check endpoint (/health).
   */
  async getHealth(): Promise<EurodesguaceHealthResponse> {
    const raw = await this.request('/health');
    return EurodesguaceHealthResponseSchema.parse(raw);
  }

  /**
   * Paged parts query (/parts).
   */
  async getParts(params: GetPartsQueryParams = {}): Promise<EurodesguacePartsResponse> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.cursor !== undefined) query.set('cursor', params.cursor);
    if (params.fields !== undefined) query.set('fields', params.fields);
    if (params.q !== undefined) query.set('q', params.q);
    if (params.updatedSince !== undefined) query.set('updated_since', params.updatedSince);
    if (params.includeDeleted) query.set('include_deleted', '1');

    if (params.marca) query.set('marca', params.marca);
    if (params.modelo) query.set('modelo', params.modelo);
    if (params.familia) query.set('familia', params.familia);
    if (params.articulo) query.set('articulo', params.articulo);
    if (params.codvehiculo) query.set('codvehiculo', params.codvehiculo);
    if (params.refvisual) query.set('refvisual', params.refvisual);
    if (params.estado) query.set('estado', params.estado);

    const queryString = query.toString();
    const endpoint = queryString ? `/parts?${queryString}` : '/parts';
    const raw = await this.request(endpoint);
    return EurodesguacePartsResponseSchema.parse(raw);
  }

  /**
   * Single part query (/parts/{refid}).
   */
  async getPartByRefId(refid: string): Promise<EurodesguacePartDetailResponse> {
    const cleanRefId = encodeURIComponent(refid.trim());
    const raw = await this.request(`/parts/${cleanRefId}`);
    return EurodesguacePartDetailResponseSchema.parse(raw);
  }

  /**
   * Internal request executor with retry, timeout, rate limit handling,
   * and strict credential confidentiality.
   */
  private async request(path: string, attempt: number = 0): Promise<unknown> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'MobileMarketplace-Backend/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      const requestId = response.headers.get('x-request-id') ?? undefined;
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

      // Handle HTTP errors
      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          // Non-JSON response
        }

        const errorType = errorData?.error?.type || errorData?.error || `HTTP_${response.status}`;
        const errorMessage = errorData?.error?.message || errorData?.message || response.statusText;

        // Retryable conditions: 429 (Rate Limit) or 500/503 (Server Error)
        if (
          (response.status === 429 || response.status === 500 || response.status === 503) &&
          attempt < this.maxRetries
        ) {
          const delayMs = retryAfterSeconds
            ? retryAfterSeconds * 1000
            : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 5000);

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.request(path, attempt + 1);
        }

        throw new EurodesguaceHttpError({
          statusCode: response.status,
          errorType,
          message: errorMessage,
          retryAfterSeconds,
          requestId,
        });
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof EurodesguaceHttpError) {
        throw error;
      }

      const isAbort = (error as Error)?.name === 'AbortError';
      if (isAbort) {
        throw new EurodesguaceHttpError({
          statusCode: 408,
          errorType: 'timeout',
          message: `Request timed out after ${this.timeoutMs}ms`,
        });
      }

      // Retry network errors if attempts remaining
      if (attempt < this.maxRetries) {
        const backoff = 500 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.request(path, attempt + 1);
      }

      throw new EurodesguaceHttpError({
        statusCode: 0,
        errorType: 'network_failure',
        message: (error as Error).message,
      });
    }
  }
}
