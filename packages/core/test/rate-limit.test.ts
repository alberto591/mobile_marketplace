import { describe, expect, it, vi } from 'vitest';
import {
  checkSharedRateLimit,
  createLocalLimiter,
  enforceRateLimit,
} from '../../../supabase/functions/_shared/rate-limit.js';

const rule = { bucket: 'test-bucket', max: 3, windowSeconds: 60 };

describe('Edge Function rate limit', () => {
  it('local limiter allows up to the maximum per window and then tells when to retry', () => {
    const limiter = createLocalLimiter(3, 60_000);
    expect([0, 1, 2].map((i) => limiter.check('ip', 1_000 + i).allowed)).toEqual([true, true, true]);
    expect(limiter.check('ip', 31_000)).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(limiter.check('other-ip', 31_000).allowed).toBe(true);
    expect(limiter.check('ip', 61_001).allowed).toBe(true);
  });

  it('asks the shared counter with the rule and the key', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, retryAfterSeconds: 0, count: 1 }, error: null });
    const result = await checkSharedRateLimit({ rpc }, rule, '203.0.113.7');
    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_bucket: 'test-bucket',
      p_key: '203.0.113.7',
      p_max: 3,
      p_window_seconds: 60,
    });
  });

  it('refuses when the shared counter says so, even if this instance has seen few requests', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: false, retryAfterSeconds: 42, count: 4 }, error: null });
    const decision = await enforceRateLimit({ supabase: { rpc }, local: createLocalLimiter(3, 60_000), rule, key: 'ip' });
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 42, source: 'shared' });
  });

  it('does not call the database once this instance is already refusing the client', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, retryAfterSeconds: 0 }, error: null });
    const local = createLocalLimiter(1, 60_000);
    await enforceRateLimit({ supabase: { rpc }, local, rule, key: 'ip', now: 0 });
    const second = await enforceRateLimit({ supabase: { rpc }, local, rule, key: 'ip', now: 1 });
    expect(second.allowed).toBe(false);
    expect(second.source).toBe('local');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local decision when the database fails, throws, hangs or is missing', async () => {
    const local = () => createLocalLimiter(3, 60_000);
    const failing = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) };
    const throwing = { rpc: vi.fn().mockRejectedValue(new Error('network')) };
    const hanging = { rpc: vi.fn().mockReturnValue(new Promise(() => {})) };
    const malformed = { rpc: vi.fn().mockResolvedValue({ data: 'yes', error: null }) };

    for (const supabase of [failing, throwing, malformed, {}, null]) {
      expect(await enforceRateLimit({ supabase, local: local(), rule, key: 'ip' })).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
        source: 'local',
      });
    }
    expect(await enforceRateLimit({ supabase: hanging, local: local(), rule, key: 'ip', timeoutMs: 20 })).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      source: 'local',
    });
  });
});
