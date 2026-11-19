import { describe, expect, it, vi } from 'vitest';
import { MemoryCartStorage } from '../services/cart-storage';
import { sanitizeStoredCartItems } from '../services/cart.service';
import { resolveCatalogDataSource } from '../services/catalog-service.factory';
import {
  listPendingOrders,
  PENDING_ORDERS_STORAGE_KEY,
  reconcilePendingOrders,
  rememberPendingOrder,
} from '../services/pending-orders.service';

const goodItem = (id: string) => ({
  part: {
    id,
    title: 'Faro',
    price: { amountInCents: 4500, currency: 'EUR' },
    availability: { status: 'AVAILABLE', stockQuantity: 1 },
  },
  vendor: { id: 'v1', tradeName: 'Desguace' },
  addedAt: '2026-11-01T10:00:00Z',
});

describe('Stored cart sanitizing', () => {
  it('drops corrupted, outdated and duplicated entries instead of crashing', () => {
    const raw = [
      goodItem('p1'),
      goodItem('p1'),
      { part: { id: 'p2', title: 'Sin precio', availability: { status: 'AVAILABLE' } }, vendor: { id: 'v1' } },
      { part: { ...goodItem('p3').part, price: { amountInCents: 45.5, currency: 'EUR' } }, vendor: { id: 'v1' } },
      { part: goodItem('p4').part },
      null,
      'garbage',
      goodItem('p5'),
    ];
    expect(sanitizeStoredCartItems(raw).map((i) => i.part.id)).toEqual(['p1', 'p5']);
  });

  it('returns an empty cart for non-array data', () => {
    expect(sanitizeStoredCartItems({ items: [] })).toEqual([]);
    expect(sanitizeStoredCartItems(null)).toEqual([]);
  });
});

describe('Catalog data source', () => {
  it('never uses the mock catalog in a release build', () => {
    expect(resolveCatalogDataSource(undefined, false)).toBe('backend');
    expect(resolveCatalogDataSource('mock', false)).toBe('backend');
    expect(resolveCatalogDataSource('backend', false)).toBe('backend');
  });

  it('uses the mock in development unless the backend is requested', () => {
    expect(resolveCatalogDataSource(undefined, true)).toBe('mock');
    expect(resolveCatalogDataSource('backend', true)).toBe('backend');
  });
});

describe('Pending orders reconciliation', () => {
  const NOW = 1_800_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  async function seed() {
    const storage = new MemoryCartStorage();
    await rememberPendingOrder(storage, { reference: 'ORD-PAID', accessToken: 'tok-paid', partIds: ['p1', 'p2'] }, NOW);
    await rememberPendingOrder(storage, { reference: 'ORD-WAIT', accessToken: 'tok-wait', partIds: ['p3'] }, NOW);
    await rememberPendingOrder(storage, { reference: 'ORD-DEAD', accessToken: 'tok-dead', partIds: ['p4'] }, NOW);
    await rememberPendingOrder(storage, { reference: 'ORD-OLD', accessToken: 'tok-old', partIds: ['p5'] }, NOW - 8 * DAY);
    return storage;
  }

  it('returns the parts of paid orders and keeps only orders still awaiting payment', async () => {
    const storage = await seed();
    const lookup = vi.fn(async (token: string) => {
      if (token === 'tok-paid') return { status: 'PAID' };
      if (token === 'tok-wait') return { status: 'PENDING_PAYMENT' };
      if (token === 'tok-dead') return { status: 'CANCELLED' };
      return null;
    });

    const paid = await reconcilePendingOrders(storage, lookup, NOW);

    expect(paid).toEqual(['p1', 'p2']);
    expect((await listPendingOrders(storage)).map((o) => o.reference)).toEqual(['ORD-WAIT']);
  });

  it('keeps recent orders when the backend cannot be reached', async () => {
    const storage = await seed();
    const paid = await reconcilePendingOrders(storage, async () => { throw new Error('offline'); }, NOW);

    expect(paid).toEqual([]);
    expect((await listPendingOrders(storage)).map((o) => o.reference)).toEqual(['ORD-PAID', 'ORD-WAIT', 'ORD-DEAD']);
  });

  it('ignores corrupted storage', async () => {
    const storage = new MemoryCartStorage();
    await storage.setItem(PENDING_ORDERS_STORAGE_KEY, '{not json');
    expect(await reconcilePendingOrders(storage, async () => ({ status: 'PAID' }), NOW)).toEqual([]);
  });
});
