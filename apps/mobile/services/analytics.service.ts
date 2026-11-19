import { Platform } from 'react-native';
import type { SearchFilters } from './catalog-service.interface';

export type ClientAnalyticsPlatform = 'web' | 'ios' | 'android';

export interface AnalyticsServiceOptions {
  readonly baseUrl?: string;
  readonly anonKey?: string;
  readonly platform?: ClientAnalyticsPlatform;
  readonly sessionId?: string;
  readonly fetchFn?: typeof fetch;
}

export interface PartClickEventInput {
  readonly partId: string;
  readonly vendorId?: string;
  readonly position?: number;
  readonly query?: string;
}

function generateSessionId(): string {
  const randomPart = Math.random().toString(36).slice(2, 12);
  const timePart = Date.now().toString(36);
  return `s_${timePart}_${randomPart}`;
}

function detectPlatform(): ClientAnalyticsPlatform {
  const os = Platform?.OS;
  if (os === 'ios' || os === 'android' || os === 'web') return os;
  return 'web';
}

export function buildSearchQueryText(filters: SearchFilters): string | null {
  const parts: string[] = [];
  if (filters.query?.trim()) parts.push(filters.query.trim());
  if (filters.oemReference?.trim()) parts.push(`OEM:${filters.oemReference.trim()}`);
  if (filters.vehicleMake?.trim() || filters.vehicleModel?.trim()) {
    const vehicle = [filters.vehicleMake?.trim(), filters.vehicleModel?.trim(), filters.vehicleYear]
      .filter(Boolean)
      .join(' ');
    if (vehicle) parts.push(vehicle);
  }
  if (parts.length === 0 && filters.categoryIds && filters.categoryIds.length > 0) {
    parts.push(`CAT:${filters.categoryIds.slice(0, 3).join(',')}`);
  }
  const combined = parts.join(' | ').trim();
  return combined ? combined.slice(0, 160) : null;
}

export class AnalyticsService {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly platform: ClientAnalyticsPlatform;
  private readonly sessionId: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: AnalyticsServiceOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
    this.anonKey = options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    this.platform = options.platform ?? detectPlatform();
    this.sessionId = options.sessionId ?? generateSessionId();
    this.fetchFn = options.fetchFn ?? fetch;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async trackSearch(filters: SearchFilters, resultCount: number): Promise<boolean> {
    const safeCount = Number.isFinite(resultCount) && resultCount >= 0 ? Math.floor(resultCount) : 0;
    const metadata: Record<string, unknown> = {
      zeroResults: safeCount === 0,
      onlyAvailable: Boolean(filters.onlyAvailable),
      sortBy: filters.sortBy ?? 'relevance',
    };
    if (filters.oemReference?.trim()) metadata.oemReference = filters.oemReference.trim().slice(0, 64);
    if (filters.vehicleMake?.trim()) metadata.vehicleMake = filters.vehicleMake.trim().slice(0, 48);
    if (filters.vehicleModel?.trim()) metadata.vehicleModel = filters.vehicleModel.trim().slice(0, 48);
    if (filters.vehicleYear) metadata.vehicleYear = filters.vehicleYear;
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      metadata.categoryIds = filters.categoryIds.slice(0, 10);
    }

    return this.sendClientEvent({
      p_event_name: 'search',
      p_vendor_id: filters.vendorId ?? null,
      p_query_text: buildSearchQueryText(filters),
      p_result_count: safeCount,
      p_metadata: metadata,
    });
  }

  async trackPartClick(input: PartClickEventInput): Promise<boolean> {
    const metadata: Record<string, unknown> = {};
    if (typeof input.position === 'number' && Number.isFinite(input.position) && input.position >= 0) {
      metadata.position = Math.floor(input.position);
    }

    return this.sendClientEvent({
      p_event_name: 'part_click',
      p_part_id: input.partId,
      p_vendor_id: input.vendorId ?? null,
      p_query_text: input.query?.trim() ? input.query.trim().slice(0, 160) : null,
      p_metadata: metadata,
    });
  }

  private async sendClientEvent(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.baseUrl || !this.anonKey) return false;

    try {
      const response = await this.fetchFn(`${this.baseUrl}/rest/v1/rpc/record_client_event`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          p_session_id: this.sessionId,
          p_platform: this.platform,
          ...payload,
        }),
      });
      return response.ok;
    } catch {
      // Usage analytics must never interrupt or degrade the buyer experience.
      return false;
    }
  }
}

export const analyticsService = new AnalyticsService();
