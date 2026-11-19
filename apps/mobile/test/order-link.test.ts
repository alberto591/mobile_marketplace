import { describe, expect, it } from 'vitest';
import { buildOrderHref, extractOrderToken } from '../services/order-link';

const TOKEN = 'cd'.repeat(32);

describe('Buyer order link', () => {
  it('keeps the token out of the query string on web: it goes in the fragment', () => {
    const href = buildOrderHref({ reference: 'ORD-202611-AB12', accessToken: TOKEN, orderedPartIds: ['p1'] }, 'web');
    expect(typeof href).toBe('string');
    const [beforeHash, hash] = (href as string).split('#');
    expect(beforeHash).toBe('/order/ORD-202611-AB12?orderedPartIds=%5B%22p1%22%5D');
    expect(beforeHash).not.toContain(TOKEN);
    expect(hash).toBe(`token=${TOKEN}`);
  });

  it('omits the query string on web when there are no ordered parts', () => {
    expect(buildOrderHref({ reference: 'ORD-1', accessToken: TOKEN }, 'web')).toBe(`/order/ORD-1#token=${TOKEN}`);
    expect(buildOrderHref({ reference: 'ORD-1', accessToken: TOKEN, orderedPartIds: [] }, 'web')).toBe(`/order/ORD-1#token=${TOKEN}`);
  });

  it('uses in-memory route params on native', () => {
    expect(buildOrderHref({ reference: 'ORD-1', accessToken: TOKEN, orderedPartIds: ['p1', 'p2'] }, 'ios')).toEqual({
      pathname: '/order/[reference]',
      params: { reference: 'ORD-1', token: TOKEN, orderedPartIds: '["p1","p2"]' },
    });
  });

  it('reads the token from the fragment first, then from the route param', () => {
    expect(extractOrderToken({ hash: `#token=${TOKEN}`, paramToken: 'ef'.repeat(32) })).toBe(TOKEN);
    expect(extractOrderToken({ hash: '', paramToken: TOKEN.toUpperCase() })).toBe(TOKEN);
    expect(extractOrderToken({ hash: '#token=nope', paramToken: undefined })).toBeNull();
    expect(extractOrderToken({})).toBeNull();
  });
});
