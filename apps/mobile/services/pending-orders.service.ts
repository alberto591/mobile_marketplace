/**
 * Remembers orders whose payment was submitted on this device, so that:
 *  - the buyer can get back to the order after leaving the confirmation screen, and
 *  - parts of a paid order are removed from the cart even if the app was closed before
 *    the backend confirmed the payment (otherwise they could be bought a second time).
 *
 * The access token is a bearer secret for one order; it is stored only on the device.
 */

import type { ICartStorage } from './cart-storage';
import { checkoutService } from './checkout.service';
import type { OrderDetail } from './checkout.service';

export const PENDING_ORDERS_STORAGE_KEY = '@mobile_marketplace:pending_orders_v1';
/** Orders placed from this device, kept so the buyer can reopen them ("Mis pedidos"). */
export const ORDER_HISTORY_STORAGE_KEY = '@mobile_marketplace:order_history_v1';
const MAX_HISTORY_ORDERS = 30;

/** Entries older than this are dropped even if the backend never answered. */
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_ORDERS = 20;

const SETTLED_STATUSES = new Set(['PAID', 'PARTIALLY_PAID', 'PAYMENT_PROCESSING', 'PROCESSING', 'COMPLETED']);
const DEAD_STATUSES = new Set(['CANCELLED', 'REFUNDED']);

export interface PendingOrder {
  readonly reference: string;
  readonly accessToken: string;
  readonly partIds: readonly string[];
  readonly createdAt: number;
}

export type OrderLookup = (accessToken: string) => Promise<Pick<OrderDetail, 'status'> | null>;

function parsePendingOrders(raw: string | null): PendingOrder[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PendingOrder =>
        typeof o?.reference === 'string' &&
        typeof o?.accessToken === 'string' &&
        Array.isArray(o?.partIds) &&
        o.partIds.every((id: unknown) => typeof id === 'string') &&
        typeof o?.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

export async function listPendingOrders(storage: ICartStorage): Promise<PendingOrder[]> {
  return parsePendingOrders(await storage.getItem(PENDING_ORDERS_STORAGE_KEY));
}

export async function rememberPendingOrder(
  storage: ICartStorage,
  order: Omit<PendingOrder, 'createdAt'>,
  now: number = Date.now()
): Promise<void> {
  const existing = (await listPendingOrders(storage)).filter((o) => o.accessToken !== order.accessToken);
  const next = [...existing, { ...order, createdAt: now }].slice(-MAX_PENDING_ORDERS);
  await storage.setItem(PENDING_ORDERS_STORAGE_KEY, JSON.stringify(next));
  await rememberOrderInHistory(storage, order, now);
}

/** Newest first. Unlike pending orders, history entries survive once the order is settled. */
export async function listOrderHistory(storage: ICartStorage): Promise<PendingOrder[]> {
  return parsePendingOrders(await storage.getItem(ORDER_HISTORY_STORAGE_KEY)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function rememberOrderInHistory(
  storage: ICartStorage,
  order: Omit<PendingOrder, 'createdAt'>,
  now: number = Date.now()
): Promise<void> {
  const history = await listOrderHistory(storage);
  if (history.some((o) => o.accessToken === order.accessToken)) return;
  const next = [{ ...order, createdAt: now }, ...history].slice(0, MAX_HISTORY_ORDERS);
  await storage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(next));
}

export async function forgetOrderInHistory(storage: ICartStorage, accessToken: string): Promise<void> {
  const next = (await listOrderHistory(storage)).filter((o) => o.accessToken !== accessToken);
  await storage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(next));
}

/**
 * Checks every remembered order against the backend.
 * Returns the part ids of orders that are paid (to be removed from the cart) and forgets
 * orders that are settled, dead or too old. Orders the backend could not be asked about
 * (offline) are kept for the next launch.
 */
export async function reconcilePendingOrders(
  storage: ICartStorage,
  lookup: OrderLookup = (token) => checkoutService.getOrderByAccessToken(token),
  now: number = Date.now()
): Promise<string[]> {
  const pending = await listPendingOrders(storage);
  if (pending.length === 0) return [];

  const paidPartIds: string[] = [];
  const keep: PendingOrder[] = [];

  for (const order of pending) {
    let status: string | undefined;
    try {
      status = (await lookup(order.accessToken))?.status;
    } catch {
      status = undefined;
    }

    if (status && SETTLED_STATUSES.has(status)) {
      paidPartIds.push(...order.partIds);
    } else if (status && DEAD_STATUSES.has(status)) {
      // Nothing to do: forget it.
    } else if (now - order.createdAt < MAX_PENDING_AGE_MS) {
      keep.push(order);
    }
  }

  if (keep.length !== pending.length) {
    await storage.setItem(PENDING_ORDERS_STORAGE_KEY, JSON.stringify(keep));
  }
  return paidPartIds;
}
