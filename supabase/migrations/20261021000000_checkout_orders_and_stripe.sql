-- =============================================================================
-- Migration: 20261021000000_checkout_orders_and_stripe.sql
-- Description: Transactional marketplace tables for orders, suborders,
--              immutable items, webhook deduplication, refunds, and vendor
--              Stripe Connect metadata. Zero impact on catalog tables.
-- Security: Strict RLS enabled; all mutations restricted to service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Vendors table extension for Stripe Connect
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'stripe_account_id'
    ) THEN
        ALTER TABLE vendors ADD COLUMN stripe_account_id VARCHAR(100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'stripe_charges_enabled'
    ) THEN
        ALTER TABLE vendors ADD COLUMN stripe_charges_enabled BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'stripe_payouts_enabled'
    ) THEN
        ALTER TABLE vendors ADD COLUMN stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'stripe_details_submitted'
    ) THEN
        ALTER TABLE vendors ADD COLUMN stripe_details_submitted BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendors' AND column_name = 'stripe_onboarding_status'
    ) THEN
        ALTER TABLE vendors ADD COLUMN stripe_onboarding_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED'
            CHECK (stripe_onboarding_status IN ('NOT_STARTED', 'PENDING', 'COMPLETED', 'RESTRICTED'));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Table: orders (Parent order consolidating customer checkout)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_reference VARCHAR(30) UNIQUE NOT NULL,
    customer_name VARCHAR(120) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    shipping_address_line1 TEXT NOT NULL,
    shipping_address_line2 TEXT,
    shipping_city TEXT NOT NULL,
    shipping_province TEXT NOT NULL,
    shipping_postal_code VARCHAR(10) NOT NULL,
    shipping_country VARCHAR(2) NOT NULL DEFAULT 'ES',
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    total_products_cents INTEGER NOT NULL CHECK (total_products_cents >= 0),
    total_shipping_cents INTEGER NOT NULL CHECK (total_shipping_cents >= 0),
    total_tax_cents INTEGER NOT NULL CHECK (total_tax_cents >= 0),
    total_order_cents INTEGER NOT NULL CHECK (total_order_cents >= 0),
    tax_status VARCHAR(30) NOT NULL DEFAULT 'UNCONFIGURED' CHECK (
        tax_status IN ('UNCONFIGURED', 'GENERAL_21', 'REBU_EXEMPT', 'NOT_APPLICABLE')
    ),
    is_test_order BOOLEAN NOT NULL DEFAULT true,
    idempotency_key VARCHAR(120) UNIQUE NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    access_token VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (
        status IN (
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
            'PAID',
            'PARTIALLY_PAID',
            'PROCESSING',
            'COMPLETED',
            'CANCELLED',
            'REFUNDED',
            'PAYMENT_FAILED'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(order_reference);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_access_token ON orders(access_token);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Table: order_suborders (Seller-specific suborder; legal & payment boundary)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_suborders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    suborder_reference VARCHAR(35) UNIQUE NOT NULL,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    stripe_account_id VARCHAR(100) NOT NULL,
    stripe_payment_intent_id VARCHAR(100) UNIQUE,
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    shipping_cents INTEGER NOT NULL CHECK (shipping_cents >= 0),
    tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= 0),
    seller_net_cents INTEGER NOT NULL CHECK (seller_net_cents >= 0),
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (
        payment_status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')
    ),
    fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK (
        fulfillment_status IN ('AWAITING_PAYMENT', 'AWAITING_SELLER_FULFILLMENT', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    ),
    shipping_carrier VARCHAR(80),
    tracking_number VARCHAR(120),
    tracking_url TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_order_suborders_order_id ON order_suborders(order_id);
CREATE INDEX IF NOT EXISTS idx_order_suborders_vendor_id ON order_suborders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_suborders_pi ON order_suborders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_order_suborders_status ON order_suborders(payment_status, fulfillment_status);

-- -----------------------------------------------------------------------------
-- 4. Table: order_items (Immutable snapshot of purchased parts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suborder_id UUID NOT NULL REFERENCES order_suborders(id) ON DELETE RESTRICT,
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    external_part_id VARCHAR(120) NOT NULL,
    title TEXT NOT NULL,
    oem_reference TEXT,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity = 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_suborder_part UNIQUE (suborder_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_suborder_id ON order_items(suborder_id);
CREATE INDEX IF NOT EXISTS idx_order_items_part_id ON order_items(part_id);

-- -----------------------------------------------------------------------------
-- 5. Table: stripe_webhook_events (Idempotency and deduplication)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    livemode BOOLEAN NOT NULL DEFAULT false,
    account_id VARCHAR(100),
    payment_intent_id VARCHAR(100),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK (
        processing_status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED')
    ),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_event_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_pi ON stripe_webhook_events(payment_intent_id);

-- -----------------------------------------------------------------------------
-- 6. Table: order_refunds (Track refunds and dispute outcomes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suborder_id UUID NOT NULL REFERENCES order_suborders(id) ON DELETE RESTRICT,
    stripe_refund_id VARCHAR(100) UNIQUE NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_suborder_id ON order_refunds(suborder_id);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security and Access Control
-- -----------------------------------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_suborders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_refunds ENABLE ROW LEVEL SECURITY;

-- Defense in depth: Revoke direct mutation from anon, authenticated, public
REVOKE ALL ON orders, order_suborders, order_items, stripe_webhook_events, order_refunds FROM anon, authenticated, public;

-- Grant all permissions strictly to service_role (Edge Functions only)
GRANT ALL ON orders, order_suborders, order_items, stripe_webhook_events, order_refunds TO service_role;

-- Public read view or RPC for guest order tracking via access_token
CREATE OR REPLACE FUNCTION get_order_by_access_token(p_access_token VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order JSONB;
BEGIN
    SELECT jsonb_build_object(
        'orderReference', o.order_reference,
        'customerName', o.customer_name,
        'customerEmail', o.customer_email,
        'shippingAddress', jsonb_build_object(
            'line1', o.shipping_address_line1,
            'line2', o.shipping_address_line2,
            'city', o.shipping_city,
            'province', o.shipping_province,
            'postalCode', o.shipping_postal_code,
            'country', o.shipping_country
        ),
        'currency', o.currency,
        'totalProductsCents', o.total_products_cents,
        'totalShippingCents', o.total_shipping_cents,
        'totalTaxCents', o.total_tax_cents,
        'totalOrderCents', o.total_order_cents,
        'taxStatus', o.tax_status,
        'status', o.status,
        'isTestOrder', o.is_test_order,
        'createdAt', o.created_at,
        'suborders', COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'suborderReference', s.suborder_reference,
                        'vendorId', s.vendor_id,
                        'vendorTradeName', v.trade_name,
                        'subtotalCents', s.subtotal_cents,
                        'shippingCents', s.shipping_cents,
                        'totalCents', s.total_cents,
                        'paymentStatus', s.payment_status,
                        'fulfillmentStatus', s.fulfillment_status,
                        'shippingCarrier', s.shipping_carrier,
                        'trackingNumber', s.tracking_number,
                        'trackingUrl', s.tracking_url,
                        'items', (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'partId', oi.part_id,
                                    'externalPartId', oi.external_part_id,
                                    'title', oi.title,
                                    'oemReference', oi.oem_reference,
                                    'unitPriceCents', oi.unit_price_cents,
                                    'quantity', oi.quantity
                                )
                            )
                            FROM order_items oi
                            WHERE oi.suborder_id = s.id
                        )
                    )
                )
                FROM order_suborders s
                JOIN vendors v ON s.vendor_id = v.id
                WHERE s.order_id = o.id
            ),
            '[]'::jsonb
        )
    )
    INTO v_order
    FROM orders o
    WHERE o.access_token = p_access_token;

    RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_by_access_token(VARCHAR) TO anon, authenticated, service_role;
