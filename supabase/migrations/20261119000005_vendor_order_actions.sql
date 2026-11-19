-- =============================================================================
-- Migration: 20261119000005_vendor_order_actions.sql
-- Description: Let the scrapyard mark a paid order as shipped without an account.
--
--   Each suborder gets a random, unguessable action token. The "order paid" email
--   to the seller links to the web page /vendor/order#token=<token>, which calls
--   the vendor-order Edge Function. The token only gives access to that one
--   suborder: its parts, the delivery address and the shipping form.
--
--   The functions below are callable by service_role only (through the Edge
--   Function), never directly by anon.
-- =============================================================================

-- 244 bits from two v4 UUIDs (gen_random_uuid uses the server's CSPRNG).
ALTER TABLE order_suborders
    ADD COLUMN IF NOT EXISTS vendor_action_token VARCHAR(64) NOT NULL
    DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_suborders_vendor_action_token
    ON order_suborders(vendor_action_token);

-- What the seller sees for one suborder
CREATE OR REPLACE FUNCTION vendor_get_suborder(p_token TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'suborderReference', s.suborder_reference,
        'orderReference', o.order_reference,
        'isTestOrder', o.is_test_order,
        'vendorTradeName', v.trade_name,
        'paymentStatus', s.payment_status,
        'fulfillmentStatus', s.fulfillment_status,
        'currency', s.currency,
        'subtotalCents', s.subtotal_cents,
        'shippingCents', s.shipping_cents,
        'totalCents', s.total_cents,
        'platformFeeCents', s.platform_fee_cents,
        'sellerNetCents', s.seller_net_cents,
        'shippingCarrier', s.shipping_carrier,
        'trackingNumber', s.tracking_number,
        'shippedAt', s.shipped_at,
        'paidOrderCreatedAt', o.created_at,
        'customer', jsonb_build_object('name', o.customer_name, 'phone', o.customer_phone),
        'shippingAddress', jsonb_build_object(
            'line1', o.shipping_address_line1,
            'line2', o.shipping_address_line2,
            'city', o.shipping_city,
            'province', o.shipping_province,
            'postalCode', o.shipping_postal_code,
            'country', o.shipping_country
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'title', oi.title,
                'externalPartId', oi.external_part_id,
                'unitPriceCents', oi.unit_price_cents
            ) ORDER BY oi.created_at, oi.id)
            FROM order_items oi WHERE oi.suborder_id = s.id
        ), '[]'::jsonb)
    )
    FROM order_suborders s
    JOIN orders o ON o.id = s.order_id
    JOIN vendors v ON v.id = s.vendor_id
    WHERE s.vendor_action_token = p_token
      -- The delivery address is only shown for orders that were actually paid.
      AND s.payment_status IN ('SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED');
$$;

-- Mark as shipped (or correct the tracking data of a shipped suborder)
-- Returns { ok, error?, firstShipment, suborderId }
CREATE OR REPLACE FUNCTION vendor_mark_suborder_shipped(
    p_token TEXT,
    p_carrier TEXT,
    p_tracking_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_sub order_suborders%ROWTYPE;
    v_carrier TEXT := NULLIF(btrim(p_carrier), '');
    v_tracking TEXT := NULLIF(btrim(p_tracking_number), '');
    v_first BOOLEAN;
BEGIN
    IF v_carrier IS NULL OR v_tracking IS NULL OR length(v_carrier) > 80 OR length(v_tracking) > 120 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SHIPPING_DATA');
    END IF;

    SELECT * INTO v_sub FROM order_suborders WHERE vendor_action_token = p_token FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
    END IF;

    IF v_sub.payment_status <> 'SUCCEEDED' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NOT_PAID', 'paymentStatus', v_sub.payment_status);
    END IF;

    IF v_sub.fulfillment_status NOT IN ('AWAITING_SELLER_FULFILLMENT', 'PROCESSING', 'SHIPPED') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NOT_SHIPPABLE', 'fulfillmentStatus', v_sub.fulfillment_status);
    END IF;

    v_first := v_sub.fulfillment_status <> 'SHIPPED';

    UPDATE order_suborders
    SET fulfillment_status = 'SHIPPED',
        shipping_carrier = v_carrier,
        tracking_number = v_tracking,
        shipped_at = COALESCE(shipped_at, now()),
        updated_at = now()
    WHERE id = v_sub.id;

    RETURN jsonb_build_object('ok', true, 'firstShipment', v_first, 'suborderId', v_sub.id);
END;
$$;

REVOKE ALL ON FUNCTION vendor_get_suborder(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vendor_mark_suborder_shipped(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION vendor_get_suborder(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION vendor_mark_suborder_shipped(TEXT, TEXT, TEXT) TO service_role;

-- "Order shipped" emails to the buyer are logged next to the "order paid" ones.
ALTER TABLE order_notifications DROP CONSTRAINT IF EXISTS order_notifications_kind_check;
ALTER TABLE order_notifications
    ADD CONSTRAINT order_notifications_kind_check CHECK (kind IN ('ORDER_PAID', 'ORDER_SHIPPED'));
