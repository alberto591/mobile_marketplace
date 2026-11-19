import type { OrderDetail } from './checkout.service';

export interface OrderStatusSummary {
  readonly label: string;
  readonly color: string;
}

/**
 * One line a buyer can act on: payment state until the order is paid, then where the
 * parcel is (taken from the least advanced suborder).
 */
export function describeOrderStatus(order: Pick<OrderDetail, 'status' | 'suborders'>): OrderStatusSummary {
  switch (order.status) {
    case 'PENDING_PAYMENT':
      return { label: 'Pendiente de pago', color: '#64748B' };
    case 'PAYMENT_PROCESSING':
      return { label: 'Confirmando el pago con el banco', color: '#D97706' };
    case 'PAYMENT_FAILED':
      return { label: 'Pago fallido', color: '#DC2626' };
    case 'CANCELLED':
      return { label: 'Pedido cancelado', color: '#DC2626' };
    case 'REFUNDED':
      return { label: 'Reembolsado', color: '#475569' };
  }

  const stages = ['AWAITING_SELLER_FULFILLMENT', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  const reached = order.suborders
    .map((s) => stages.indexOf(s.fulfillmentStatus))
    .filter((i) => i >= 0);
  const stage = reached.length > 0 ? stages[Math.min(...reached)] : 'AWAITING_SELLER_FULFILLMENT';

  switch (stage) {
    case 'DELIVERED':
      return { label: 'Entregado', color: '#16A34A' };
    case 'SHIPPED':
      return { label: 'Enviado', color: '#16A34A' };
    case 'PROCESSING':
      return { label: 'Pagado · en preparación', color: '#16A34A' };
    default:
      return { label: 'Pagado · pendiente de envío', color: '#16A34A' };
  }
}
