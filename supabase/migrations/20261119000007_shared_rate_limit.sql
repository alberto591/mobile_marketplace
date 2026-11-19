-- =============================================================================
-- Migration: 20261119000007_shared_rate_limit.sql
-- Description: Request rate limit shared by every Edge Function instance.
--
--   Each Edge Function kept its own counter in memory, so the limit applied per
--   running instance: under load the platform starts more instances and each one
--   allowed the full quota again. This counter lives in the database, so all
--   instances of a function share it.
--
--     SELECT check_rate_limit('create-payment-intent', '<client ip>', 10, 60);
--     -> {"allowed": true, "retryAfterSeconds": 0, "count": 1}
--
--   Fixed window per (bucket, key): the first request opens a window of
--   p_window_seconds; requests beyond p_max inside it are refused until it ends.
--   One atomic upsert per request, so concurrent requests cannot overshoot.
--
--   The key (an IP address) is stored only as a SHA-256 hash, and rows are
--   deleted about an hour after their window ends.
--   Callable by service_role only (through the Edge Functions).
-- =============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    bucket          TEXT        NOT NULL,
    key_hash        TEXT        NOT NULL,
    window_start    TIMESTAMPTZ NOT NULL,
    window_seconds  INTEGER     NOT NULL CHECK (window_seconds > 0),
    request_count   INTEGER     NOT NULL CHECK (request_count > 0),
    PRIMARY KEY (bucket, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_window_start ON rate_limit_counters(window_start);

-- No policies: anon and authenticated cannot read or write it.
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE rate_limit_counters TO service_role;

CREATE OR REPLACE FUNCTION check_rate_limit(
    p_bucket TEXT,
    p_key TEXT,
    p_max INTEGER,
    p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_count INTEGER;
    v_window_start TIMESTAMPTZ;
    v_retry INTEGER;
BEGIN
    IF NULLIF(btrim(p_bucket), '') IS NULL OR length(p_bucket) > 64 THEN
        RAISE EXCEPTION 'check_rate_limit: invalid bucket';
    END IF;
    IF p_max IS NULL OR p_max < 1 OR p_max > 100000 THEN
        RAISE EXCEPTION 'check_rate_limit: p_max out of range';
    END IF;
    IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
        RAISE EXCEPTION 'check_rate_limit: p_window_seconds out of range';
    END IF;

    INSERT INTO rate_limit_counters AS c (bucket, key_hash, window_start, window_seconds, request_count)
    VALUES (
        p_bucket,
        encode(sha256(convert_to(COALESCE(p_key, ''), 'UTF8')), 'hex'),
        v_now,
        p_window_seconds,
        1
    )
    ON CONFLICT (bucket, key_hash) DO UPDATE SET
        request_count = CASE
            WHEN c.window_start + make_interval(secs => p_window_seconds) <= v_now THEN 1
            -- Stop counting just past the limit so a flood cannot overflow the integer.
            ELSE LEAST(c.request_count + 1, p_max + 1)
        END,
        window_start = CASE
            WHEN c.window_start + make_interval(secs => p_window_seconds) <= v_now THEN v_now
            ELSE c.window_start
        END,
        window_seconds = p_window_seconds
    RETURNING c.request_count, c.window_start INTO v_count, v_window_start;

    -- Occasional cleanup of counters whose window ended over an hour ago.
    IF random() < 0.02 THEN
        DELETE FROM rate_limit_counters
        WHERE window_start + make_interval(secs => window_seconds) < v_now - interval '1 hour';
    END IF;

    IF v_count > p_max THEN
        v_retry := GREATEST(
            1,
            ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::INTEGER
        );
        RETURN jsonb_build_object('allowed', false, 'retryAfterSeconds', v_retry, 'count', v_count);
    END IF;

    RETURN jsonb_build_object('allowed', true, 'retryAfterSeconds', 0, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
