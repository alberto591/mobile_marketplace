import { describe, expect, it } from 'vitest';
import { MemoryCartStorage } from '../services/cart-storage';
import { describeOrderStatus } from '../services/order-status';
import {
  forgetOrderInHistory,
  listOrderHistory,
  listPendingOrders,
  reconcilePendingOrders,
  rememberPendingOrder,
} from '../services/pending-orders.service';

const sub = (fulfillmentStatus: string) => ({ fulfillmentStatus }) as any;

describe('Order history ("Mis pedidos")', () => {
  it('keeps an order in the history after it is settled and dropped from the pending list', async () => {
    const storage = new MemoryCartStorage();
    await rememberPendingOrder(storage, { reference: 'ORD-1', accessToken: 't1', partIds: ['p1'] }, 1000);
    await rememberPendingOrder(storage, { reference: 'ORD-2', accessToken: 't2', partIds: ['p2', 'p3'] }, 2000);

    await reconcilePendingOrders(storage, async () => ({ status: 'PAID' }), 3000);

    expect(await listPendingOrders(storage)).toEqual([]);
    expect((await listOrderHistory(storage)).map((o) => o.reference)).toEqual(['ORD-2', 'ORD-1']); // newest first
  });

  it('does not duplicate an order remembered twice and can forget one', async () => {
    const storage = new MemoryCartStorage();
    await rememberPendingOrder(storage, { reference: 'ORD-1', accessToken: 't1', partIds: ['p1'] }, 1000);
    await rememberPendingOrder(storage, { reference: 'ORD-1', accessToken: 't1', partIds: ['p1'] }, 5000);
    expect(await listOrderHistory(storage)).toHaveLength(1);

    await forgetOrderInHistory(storage, 't1');
    expect(await listOrderHistory(storage)).toEqual([]);
  });
});

describe('Order status summary', () => {
  it('shows the payment state until the order is paid', () => {
    expect(describeOrderStatus({ status: 'PENDING_PAYMENT', suborders: [] }).label).toBe('Pendiente de pago');
    expect(describeOrderStatus({ status: 'PAYMENT_FAILED', suborders: [] }).label).toBe('Pago fallido');
    expect(describeOrderStatus({ status: 'REFUNDED', suborders: [sub('SHIPPED')] }).label).toBe('Reembolsado');
  });

  it('shows where the parcel is once paid, using the least advanced suborder', () => {
    expect(describeOrderStatus({ status: 'PAID', suborders: [sub('AWAITING_SELLER_FULFILLMENT')] }).label).toBe('Pagado · pendiente de envío');
    expect(describeOrderStatus({ status: 'PAID', suborders: [sub('SHIPPED')] }).label).toBe('Enviado');
    expect(describeOrderStatus({ status: 'PAID', suborders: [sub('SHIPPED'), sub('PROCESSING')] }).label).toBe('Pagado · en preparación');
    expect(describeOrderStatus({ status: 'PAID', suborders: [sub('DELIVERED')] }).label).toBe('Entregado');
  });
});
