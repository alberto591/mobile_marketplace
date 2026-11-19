import { describe, expect, it } from 'vitest';
import {
  buildOrderShippedPushMessages,
  notifyBuyerShippedPush,
} from '../../../supabase/functions/_shared/expo-push';
import { handleReportOrderIssue } from '../../../supabase/functions/_shared/order-issues';

describe('Expo Push Notifications for Shipped Orders', () => {
  it('filters invalid push tokens, deduplicates, and builds shipment payload', () => {
    const msgs = buildOrderShippedPushMessages({
      tokens: [
        'ExponentPushToken[abc123456789]',
        'ExponentPushToken[abc123456789]',
        'not-a-valid-token',
        'ExpoPushToken[xyz987654321]',
      ],
      orderReference: 'ORD-202611-TEST',
      carrier: 'SEUR',
      trackingNumber: 'ES123456789',
    });

    expect(msgs).toHaveLength(2);
    expect(msgs[0].title).toBe('Pedido ORD-202611-TEST enviado');
    expect(msgs[0].body).toContain('SEUR');
    expect(msgs[0].body).toContain('ES123456789');
    expect(msgs[0].data?.type).toBe('ORDER_SHIPPED');
  });

  it('sends push notification when tokens exist for the order', async () => {
    const sent: unknown[] = [];
    const fakeSupabase = {
      from(table: string) {
        if (table === 'order_suborders') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    order_id: 'ord-1',
                    shipping_carrier: 'MRW',
                    tracking_number: 'MRW-999',
                    orders: { order_reference: 'ORD-202611-PUSH' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: async () => ({
              data: [{ expo_push_token: 'ExponentPushToken[validToken12345]' }],
              error: null,
            }),
          }),
        };
      },
    };

    const status = await notifyBuyerShippedPush({
      supabase: fakeSupabase,
      suborderId: 'sub-1',
      pushSender: async (messages) => {
        sent.push(...messages);
        return { ok: true };
      },
    });

    expect(status).toBe('SENT');
    expect(sent).toHaveLength(1);
  });
});

describe('Report Order Issue / Return Request Handler', () => {
  it('validates token, issueType, and description length', async () => {
    const res1 = await handleReportOrderIssue({
      supabase: {},
      payload: { accessToken: 'short', issueType: 'DEFECTIVE_PART', description: 'Pieza rota al llegar' },
      emailConfig: {},
    });
    expect(res1.status).toBe(400);

    const res2 = await handleReportOrderIssue({
      supabase: {},
      payload: { accessToken: 'a'.repeat(32), issueType: 'INVALID', description: 'Pieza rota al llegar' },
      emailConfig: {},
    });
    expect(res2.status).toBe(400);

    const res3 = await handleReportOrderIssue({
      supabase: {},
      payload: { accessToken: 'a'.repeat(32), issueType: 'DEFECTIVE_PART', description: 'corta' },
      emailConfig: {},
    });
    expect(res3.status).toBe(400);
  });

  it('creates an OPEN issue and alerts ops via email', async () => {
    const emails: Array<{ to: string; subject: string; text: string }> = [];
    const fakeSupabase = {
      from(table: string) {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'ord-123',
                    order_reference: 'ORD-202611-ABCD',
                    status: 'PAID',
                    customer_name: 'Carlos',
                    customer_email: 'carlos@example.com',
                    customer_phone: '+34600111222',
                    is_test_order: true,
                    order_suborders: [
                      {
                        id: 'sub-123',
                        suborder_reference: 'ORD-202611-ABCD-01',
                        shipping_carrier: 'SEUR',
                        tracking_number: 'SEUR-1',
                        vendors: { trade_name: 'Eurodesguace Málaga' },
                        order_items: [{ title: 'FARO DELANTERO', external_part_id: '9001' }],
                      },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'issue-999', status: 'OPEN', created_at: '2026-11-19T09:00:00Z' },
                error: null,
              }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    };

    const res = await handleReportOrderIssue({
      supabase: fakeSupabase,
      payload: {
        accessToken: 'a'.repeat(32),
        issueType: 'SHIPPING_DAMAGE',
        description: 'La caja llegó golpeada y la patilla derecha del faro está partida.',
      },
      emailConfig: {
        fromEmail: 'soporte@buscapiezas.test',
        opsAlertEmail: 'ops@buscapiezas.test',
      },
      sender: async (msg) => {
        emails.push({ to: msg.to, subject: msg.subject, text: msg.text });
        return { success: true, messageId: 'msg-1' };
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.issueId).toBe('issue-999');
    expect(res.body.opsNotified).toBe('SENT');
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toContain('ORD-202611-ABCD');
    expect(emails[0].text).toContain('Eurodesguace Málaga');
  });
});
