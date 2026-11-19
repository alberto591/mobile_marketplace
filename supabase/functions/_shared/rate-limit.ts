// Request rate limiting for the Edge Functions. Dependency-free.
//
// Two layers:
//   1. A counter in the memory of this function instance: free, and it stops a flood
//      against one instance without touching the database.
//   2. check_rate_limit() in PostgreSQL: one counter shared by every instance, so the
//      limit holds when the platform runs several instances at once.
// If the database check fails or is slow, the request is decided by layer 1 alone:
// a database problem must not take checkout down with it.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  /** Which layer decided: the shared database counter or this instance's memory. */
  readonly source: 'shared' | 'local';
}

export interface LocalLimiter {
  check(key: string, now?: number): { allowed: boolean; retryAfterSeconds: number };
  readonly size: number;
}

export function createLocalLimiter(max: number, windowMs: number, maxEntries = 1000): LocalLimiter {
  const cache = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key, now = Date.now()) {
      if (cache.size > maxEntries) {
        for (const [k, v] of cache.entries()) if (now > v.resetAt) cache.delete(k);
      }
      const entry = cache.get(key);
      if (!entry || now > entry.resetAt) {
        cache.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (entry.count >= max) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
      }
      entry.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    get size() {
      return cache.size;
    },
  };
}

export interface RateLimitRule {
  readonly bucket: string;
  readonly max: number;
  readonly windowSeconds: number;
}

/** Asks the database counter. Returns null when it cannot be reached in time. */
export async function checkSharedRateLimit(
  supabase: SupabaseLike,
  rule: RateLimitRule,
  key: string,
  timeoutMs = 2000
): Promise<{ allowed: boolean; retryAfterSeconds: number } | null> {
  if (!supabase || typeof supabase.rpc !== 'function') return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const call = Promise.resolve(
      supabase.rpc('check_rate_limit', {
        p_bucket: rule.bucket,
        p_key: key,
        p_max: rule.max,
        p_window_seconds: rule.windowSeconds,
      })
    ).then((res: { data?: unknown; error?: unknown } | null) => res);

    const res = await Promise.race([call, timeout]);
    if (!res || res.error) return null;

    const data = res.data as { allowed?: unknown; retryAfterSeconds?: unknown } | null;
    if (!data || typeof data.allowed !== 'boolean') return null;

    const retry = Number(data.retryAfterSeconds);
    return {
      allowed: data.allowed,
      retryAfterSeconds: data.allowed ? 0 : Math.max(1, Number.isFinite(retry) ? Math.ceil(retry) : rule.windowSeconds),
    };
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function enforceRateLimit(input: {
  readonly supabase: SupabaseLike;
  readonly local: LocalLimiter;
  readonly rule: RateLimitRule;
  readonly key: string;
  readonly now?: number;
  readonly timeoutMs?: number;
}): Promise<RateLimitDecision> {
  const local = input.local.check(input.key, input.now);
  if (!local.allowed) return { ...local, source: 'local' };

  const shared = await checkSharedRateLimit(input.supabase, input.rule, input.key, input.timeoutMs);
  if (shared) return { ...shared, source: 'shared' };

  return { allowed: true, retryAfterSeconds: 0, source: 'local' };
}
