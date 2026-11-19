-- =============================================================================
-- Migration: 20261119000003_order_notifications.sql
-- Description: Delivery log for "order paid" emails (one to the buyer, one to the
--              seller per suborder). The unique key makes sending idempotent
--              across Stripe webhook retries, and FAILED rows can be retried.
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suborder_id UUID NOT NULL REFERENCES order_suborders(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL DEFAULT 'ORDER_PAID' CHECK (kind IN ('ORDER_PAID')),
    audience VARCHAR(10) NOT NULL CHECK (audience IN ('BUYER', 'SELLER')),
    channel VARCHAR(20) NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL')),
    recipient VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED')
    ),
    provider VARCHAR(40) NOT NULL DEFAULT 'resend',
    provider_message_id TEXT,
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempted_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_notification UNIQUE (suborder_id, kind, audience)
);

CREATE INDEX IF NOT EXISTS idx_order_notifications_status ON order_notifications(status);

ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_notifications FROM anon, authenticated, public;
GRANT ALL ON order_notifications TO service_role;
