-- =============================================================================
-- Migration: 20261119000009_usage_analytics.sql
-- Description: First-party, privacy-respecting usage measurement for the
--   marketplace funnel defined in docs/2026-10-19_product-brief.md:
--     - search (with result_count, enabling zero-result search analysis)
--     - part_click (click on a search result card)
--     - inquiry_submitted (server-side, from submit-inquiry)
--     - checkout_started (server-side, from create-payment-intent)
--     - purchase_completed (server-side, from stripe-webhook on first PAID)
--
--   Security & Privacy:
--     - Zero PII stored (no emails, names, IPs, or cross-session cookies).
--     - Direct table access is restricted to service_role only (RLS enabled).
--     - Clients record only 'search' and 'part_click' through the validated,
--       rate-limited RPC record_client_event(); server-side conversion events
--       cannot be forged by anon callers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name      VARCHAR(40) NOT NULL CHECK (
        event_name IN (
            'search',
            'part_click',
            'inquiry_submitted',
            'checkout_started',
            'purchase_completed'
        )
    ),
    session_id      VARCHAR(64),
    platform        VARCHAR(16) CHECK (
        platform IS NULL OR platform IN ('web', 'ios', 'android', 'server')
    ),
    part_id         UUID REFERENCES parts(id) ON DELETE SET NULL,
    vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    query_text      VARCHAR(160),
    result_count    INTEGER CHECK (result_count IS NULL OR result_count >= 0),
    amount_cents    INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 2048),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_created_at
    ON product_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_name_created
    ON product_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_zero_results
    ON product_events(created_at DESC)
    WHERE event_name = 'search' AND result_count = 0;

-- Lock down direct table access: anon and authenticated never read or write raw rows.
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE product_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE product_events TO service_role;

-- -----------------------------------------------------------------------------
-- Client-facing RPC: record_client_event
-- Accepts only 'search' and 'part_click'. Rate-limited per session via the
-- shared check_rate_limit() counter. Returns TRUE if recorded, FALSE if dropped.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_client_event(
    p_event_name   TEXT,
    p_session_id   TEXT    DEFAULT NULL,
    p_platform     TEXT    DEFAULT NULL,
    p_part_id      UUID    DEFAULT NULL,
    p_vendor_id    UUID    DEFAULT NULL,
    p_query_text   TEXT    DEFAULT NULL,
    p_result_count INTEGER DEFAULT NULL,
    p_metadata     JSONB   DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event       TEXT;
    v_session     TEXT;
    v_platform    TEXT;
    v_query       TEXT;
    v_part_id     UUID := p_part_id;
    v_vendor_id   UUID := p_vendor_id;
    v_result_cnt  INTEGER := p_result_count;
    v_meta        JSONB := COALESCE(p_metadata, '{}'::jsonb);
    v_rate_check  JSONB;
BEGIN
    v_event := lower(btrim(COALESCE(p_event_name, '')));
    IF v_event NOT IN ('search', 'part_click') THEN
        RETURN FALSE;
    END IF;

    v_session := left(NULLIF(btrim(COALESCE(p_session_id, '')), ''), 64);
    v_rate_check := check_rate_limit('product-events', COALESCE(v_session, 'anon'), 120, 60);
    IF NOT COALESCE((v_rate_check ->> 'allowed')::BOOLEAN, FALSE) THEN
        RETURN FALSE;
    END IF;

    v_platform := lower(btrim(COALESCE(p_platform, '')));
    IF v_platform NOT IN ('web', 'ios', 'android') THEN
        v_platform := NULL;
    END IF;

    v_query := left(NULLIF(btrim(COALESCE(p_query_text, '')), ''), 160);

    IF v_result_cnt IS NOT NULL AND v_result_cnt < 0 THEN
        v_result_cnt := 0;
    END IF;

    IF jsonb_typeof(v_meta) <> 'object' OR octet_length(v_meta::text) > 2048 THEN
        v_meta := '{}'::jsonb;
    END IF;

    -- Tolerate stale IDs without failing the insert.
    IF v_part_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parts WHERE id = v_part_id) THEN
        v_part_id := NULL;
    END IF;
    IF v_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vendors WHERE id = v_vendor_id) THEN
        v_vendor_id := NULL;
    END IF;

    INSERT INTO product_events (
        event_name,
        session_id,
        platform,
        part_id,
        vendor_id,
        query_text,
        result_count,
        metadata
    ) VALUES (
        v_event,
        v_session,
        v_platform,
        v_part_id,
        v_vendor_id,
        v_query,
        CASE WHEN v_event = 'search' THEN v_result_cnt ELSE NULL END,
        v_meta
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION record_client_event(TEXT, TEXT, TEXT, UUID, UUID, TEXT, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_client_event(TEXT, TEXT, TEXT, UUID, UUID, TEXT, INTEGER, JSONB)
    TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Reporting Views (service_role only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW usage_funnel_daily
WITH (security_invoker = true)
AS
SELECT
    date_trunc('day', created_at)::DATE                                              AS day,
    COUNT(*) FILTER (WHERE event_name = 'search')                                    AS searches,
    COUNT(*) FILTER (WHERE event_name = 'search' AND result_count = 0)               AS searches_zero_results,
    CASE
        WHEN COUNT(*) FILTER (WHERE event_name = 'search') > 0
        THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE event_name = 'search' AND result_count = 0)
            / COUNT(*) FILTER (WHERE event_name = 'search'),
            2
        )
        ELSE 0
    END                                                                              AS zero_result_rate_pct,
    COUNT(*) FILTER (WHERE event_name = 'part_click')                                AS part_clicks,
    CASE
        WHEN COUNT(*) FILTER (WHERE event_name = 'search') > 0
        THEN ROUND(
            100.0 * COUNT(*) FILTER (WHERE event_name = 'part_click')
            / COUNT(*) FILTER (WHERE event_name = 'search'),
            2
        )
        ELSE 0
    END                                                                              AS search_ctr_pct,
    COUNT(*) FILTER (WHERE event_name = 'inquiry_submitted')                         AS inquiries,
    COUNT(*) FILTER (WHERE event_name = 'checkout_started')                          AS checkouts_started,
    COUNT(*) FILTER (WHERE event_name = 'purchase_completed')                        AS purchases_completed,
    COALESCE(SUM(amount_cents) FILTER (WHERE event_name = 'purchase_completed'), 0)  AS gmv_cents
FROM product_events
GROUP BY date_trunc('day', created_at)::DATE
ORDER BY day DESC;

CREATE OR REPLACE VIEW usage_zero_result_queries
WITH (security_invoker = true)
AS
SELECT
    lower(COALESCE(NULLIF(btrim(query_text), ''), '(sin texto)')) AS normalized_query,
    COUNT(*)                                                       AS occurrences,
    MAX(created_at)                                                AS last_seen_at
FROM product_events
WHERE event_name = 'search'
  AND result_count = 0
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY lower(COALESCE(NULLIF(btrim(query_text), ''), '(sin texto)'))
ORDER BY occurrences DESC, last_seen_at DESC;

REVOKE ALL ON TABLE usage_funnel_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE usage_funnel_daily TO service_role;

REVOKE ALL ON TABLE usage_zero_result_queries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE usage_zero_result_queries TO service_role;
