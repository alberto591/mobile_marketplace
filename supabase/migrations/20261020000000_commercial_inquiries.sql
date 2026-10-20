-- =============================================================================
-- Migration: 20261020000000_commercial_inquiries.sql
-- Description: Additive schema for commercial inquiries, part snapshots,
--              and notification outbox logging. Zero impact on catalog tables.
-- Security: Strict RLS enabled; tables are completely private to service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table: inquiries (Header for commercial inquiries per vendor)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_reference VARCHAR(30) UNIQUE NOT NULL,
    group_id UUID NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    customer_name VARCHAR(120) NOT NULL,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_message TEXT,
    vehicle_vin VARCHAR(50),
    vehicle_plate VARCHAR(20),
    privacy_policy_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    privacy_policy_accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    idempotency_key VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED' CHECK (
        status IN ('REGISTERED', 'NOTIFICATION_SENT', 'NOTIFICATION_FAILED', 'RESPONDED', 'CANCELLED')
    ),
    source VARCHAR(40) NOT NULL DEFAULT 'mobile_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_customer_contact CHECK (
        (customer_email IS NOT NULL AND trim(customer_email) <> '') OR
        (customer_phone IS NOT NULL AND trim(customer_phone) <> '')
    ),
    CONSTRAINT uq_vendor_idempotency UNIQUE (vendor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_group_id ON inquiries(group_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_vendor_id ON inquiries(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_reference ON inquiries(inquiry_reference);

-- -----------------------------------------------------------------------------
-- 2. Table: inquiry_items (Immutable snapshot of each part at inquiry time)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inquiry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    external_part_id VARCHAR(120) NOT NULL,
    title TEXT NOT NULL,
    oem_reference TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    availability_status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_inquiry_part UNIQUE (inquiry_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_inquiry_items_inquiry_id ON inquiry_items(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_items_part_id ON inquiry_items(part_id);

-- -----------------------------------------------------------------------------
-- 3. Table: inquiry_notifications (Delivery tracking and outbox pattern)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inquiry_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL', 'WHATSAPP', 'SMS')),
    recipient VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED')
    ),
    provider VARCHAR(40) NOT NULL DEFAULT 'resend',
    provider_message_id TEXT,
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempted_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_inquiry_notifications_inquiry_id ON inquiry_notifications(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_notifications_status ON inquiry_notifications(status);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security & Access Control
-- -----------------------------------------------------------------------------
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_notifications ENABLE ROW LEVEL SECURITY;

-- Defense in depth: Deny all direct access to public/anon/authenticated roles
REVOKE ALL ON inquiries, inquiry_items, inquiry_notifications FROM anon, authenticated, public;

-- Exclusive access granted to service_role for Edge Functions
GRANT ALL ON inquiries, inquiry_items, inquiry_notifications TO service_role;
