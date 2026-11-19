import { describe, expect, it } from 'vitest';
import { OrderIssueError, OrderIssueService } from '../services/order-issue.service';
import { registerOrderPushTokenRpc } from '../services/push-notifications.service';

describe('Mobile OrderIssueService & Push Registration RPC', () => {
  it('submits an order issue and returns the ticket ID', async () => {
    const svc = new OrderIssueService({
      baseUrl: 'https://example.supabase.co',
      anonKey: 'anon-test',
      fetchFn: async () =>
        new Response(JSON.stringify({ success: true, issueId: 'iss-123', status: 'OPEN' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    const res = await svc.reportIssue({
      accessToken: 'a'.repeat(32),
      issueType: 'WITHDRAWAL_14D',
      description: 'Quiero ejercer el derecho de desistimiento dentro de los 14 días.',
    });

    expect(res.success).toBe(true);
    expect(res.issueId).toBe('iss-123');
    expect(res.status).toBe('OPEN');
  });

  it('throws OrderIssueError when server rejects the request', async () => {
    const svc = new OrderIssueService({
      baseUrl: 'https://example.supabase.co',
      anonKey: 'anon-test',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: 'TOO_MANY_OPEN_ISSUES',
            message: 'Ya tienes incidencias abiertas.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        ),
    });

    await expect(
      svc.reportIssue({
        accessToken: 'a'.repeat(32),
        issueType: 'DEFECTIVE_PART',
        description: 'La pieza no funciona correctamente.',
      })
    ).rejects.toBeInstanceOf(OrderIssueError);
  });

  it('calls register_order_push_token RPC with order access token and Expo push token', async () => {
    let capturedBody: Record<string, unknown> = {};
    const ok = await registerOrderPushTokenRpc(
      {
        accessToken: 'b'.repeat(32),
        expoPushToken: 'ExponentPushToken[abc123456789]',
        platform: 'ios',
      },
      {
        baseUrl: 'https://example.supabase.co',
        anonKey: 'anon-test',
        fetchFn: async (_input, init) => {
          capturedBody = JSON.parse(String(init?.body ?? '{}'));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        },
      }
    );

    expect(ok).toBe(true);
    expect(capturedBody).toEqual({
      p_access_token: 'b'.repeat(32),
      p_expo_push_token: 'ExponentPushToken[abc123456789]',
      p_platform: 'ios',
    });
  });
});
