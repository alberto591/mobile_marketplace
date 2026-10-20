import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../../supabase/functions/eurodesguace-sync/index.js';

describe('Eurodesguace Edge Function Security & Authorization', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.EURODESGUACE_API_KEY = 'test-secret-provider-key';
    process.env.EURODESGUACE_BASE_URL = 'https://api.test-desguace.com/v1';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-admin-token';
    process.env.SYNC_ADMIN_SECRET = 'test-custom-admin-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rejects sync-batch requests when no authorization header is provided (HTTP 401)', async () => {
    const req = new Request('http://localhost/eurodesguace-sync?action=sync-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('unauthorized');
    expect(body.message).toContain('service_role');
  });

  it('rejects sync-batch requests with an invalid Bearer token (HTTP 401)', async () => {
    const req = new Request('http://localhost/eurodesguace-sync?action=sync-batch', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid-anonymous-token',
        'Content-Type': 'application/json',
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('allows sync-batch when valid service_role key is supplied in Authorization header', async () => {
    // Mock the external provider fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              refid: 9991,
              familia: 'MOTOR',
              articulo: 'MOTOR COMPLETO',
              marca: 'SEAT',
              modelo: 'LEON',
              precio: '450,00',
            },
          ],
          meta: { total: 1, next_cursor: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req = new Request('http://localhost/eurodesguace-sync?action=sync-batch&limit=10', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-service-role-admin-token',
        'Content-Type': 'application/json',
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.validItems).toBe(1);
  });

  it('health check returns sanitized status without leaking backend secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            site: 'eurodesguacemalaga.com',
            environment: 'production',
            key: { name: 'Test Key', scopes: ['parts:read'] },
            time: '2026-10-19T22:00:00Z',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req = new Request('http://localhost/eurodesguace-sync?action=health', {
      method: 'GET',
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.provider).toBe('Eurodesguace Málaga');
    expect(body.scopes).toContain('parts:read');
    // Ensure secrets are never returned in body
    const textBody = JSON.stringify(body);
    expect(textBody).not.toContain('test-secret-provider-key');
    expect(textBody).not.toContain('test-service-role-admin-token');
  });

  it('clamps requested limit to maximum 50 items on server side', async () => {
    let capturedUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input: any) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({
          data: [],
          meta: { total: 0, next_cursor: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('http://localhost/eurodesguace-sync?action=sync-batch&limit=200', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-service-role-admin-token',
        'Content-Type': 'application/json',
      },
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(capturedUrl).toContain('limit=50');
  });
});
