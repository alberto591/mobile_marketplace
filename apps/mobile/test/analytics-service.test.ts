import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService, buildSearchQueryText } from '../services/analytics.service';

describe('AnalyticsService', () => {
  it('builds readable query text from text, OEM, vehicle, and category filters', () => {
    expect(buildSearchQueryText({ query: 'Faro delantero', vehicleMake: 'Seat', vehicleModel: 'Leon', vehicleYear: 2018 })).toBe(
      'Faro delantero | Seat Leon 2018'
    );
    expect(buildSearchQueryText({ oemReference: '1K0121205AD' })).toBe('OEM:1K0121205AD');
    expect(buildSearchQueryText({ categoryIds: ['MOTOR', 'CAJA'] })).toBe('CAT:MOTOR,CAJA');
    expect(buildSearchQueryText({})).toBeNull();
  });

  it('sends search events including zero-result flags to record_client_event RPC', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('true', { status: 200 }));
    const service = new AnalyticsService({
      baseUrl: 'https://example.supabase.co/',
      anonKey: 'anon-key',
      platform: 'web',
      sessionId: 'sess_test_1',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const ok = await service.trackSearch(
      { query: 'pieza inexistente', vehicleMake: 'Audi', vehicleModel: 'A3', onlyAvailable: true },
      0
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/record_client_event');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      p_session_id: 'sess_test_1',
      p_platform: 'web',
      p_event_name: 'search',
      p_vendor_id: null,
      p_query_text: 'pieza inexistente | Audi A3',
      p_result_count: 0,
      p_metadata: {
        zeroResults: true,
        onlyAvailable: true,
        sortBy: 'relevance',
        vehicleMake: 'Audi',
        vehicleModel: 'A3',
      },
    });
  });

  it('sends part_click events with partId, vendorId, position, and query context', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('true', { status: 200 }));
    const service = new AnalyticsService({
      baseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      platform: 'ios',
      sessionId: 'sess_test_2',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const ok = await service.trackPartClick({
      partId: 'part-123',
      vendorId: 'vendor-456',
      position: 2,
      query: 'Alternador',
    });

    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      p_session_id: 'sess_test_2',
      p_platform: 'ios',
      p_event_name: 'part_click',
      p_part_id: 'part-123',
      p_vendor_id: 'vendor-456',
      p_query_text: 'Alternador',
      p_metadata: { position: 2 },
    });
  });

  it('never throws when network fails or backend URL is missing', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const service = new AnalyticsService({
      baseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      fetchFn: failingFetch as unknown as typeof fetch,
    });
    await expect(service.trackSearch({ query: 'Faro' }, 5)).resolves.toBe(false);

    const unconfigured = new AnalyticsService({ baseUrl: '', anonKey: '' });
    await expect(unconfigured.trackPartClick({ partId: 'p1' })).resolves.toBe(false);
  });
});
