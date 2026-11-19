-- =============================================================================
-- Migration: 20261119000000_part_reservations.sql
-- Description: Prevent selling the same physical part twice.
--
--   * Every part is a single physical unit. Checkout now reserves the parts of an
--     order atomically (row locks) before creating the Stripe PaymentIntent.
--   * A reservation expires after a TTL. An expired reservation is listed again
--     in the public catalog, but it is only taken over after create-payment-intent
--     has cancelled the previous order's PaymentIntent in Stripe, so a late
--     payment of the old order can never collide with a new buyer.
--   * payment_intent.succeeded marks the parts as sold (sold_order_id), and
--     payment_intent.canceled releases them.
--   * A trigger stops catalog sync upserts (scripts/sync_eurodesguace_*.py) from
--     flipping a reserved or sold part back to AVAILABLE.
-- =============================================================================

-- 1. Reservation columns
ALTER TABLE parts ADD COLUMN IF NOT EXISTS reserved_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;
ALTER TABLE parts ADD COLUMN IF NOT EXISTS sold_order_id UUID REFERENCES orders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_parts_reserved_order_id ON parts(reserved_order_id) WHERE reserved_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parts_sold_order_id ON parts(sold_order_id) WHERE sold_order_id IS NOT NULL;

-- 2. Guard trigger: only the reservation functions below may change reservation state.
--    They switch app.reservation_write on for their own UPDATE and off again before
--    returning, so later statements in the same transaction are guarded too.
CREATE OR REPLACE FUNCTION protect_part_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_setting('app.reservation_write', true) = 'on' THEN
        RETURN NEW;
    END IF;

    NEW.reserved_order_id := OLD.reserved_order_id;
    NEW.reserved_until := OLD.reserved_until;
    NEW.sold_order_id := OLD.sold_order_id;

    IF OLD.sold_order_id IS NOT NULL THEN
        -- A sold part never comes back to the catalog through a sync.
        NEW.availability_status := OLD.availability_status;
    ELSIF OLD.reserved_order_id IS NOT NULL AND NEW.availability_status = 'AVAILABLE' THEN
        -- Keep the reservation visible; the provider may still withdraw the part (OUT_OF_STOCK / WITHDRAWN).
        NEW.availability_status := 'RESERVED';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_part_reservation ON parts;
CREATE TRIGGER trg_protect_part_reservation
    BEFORE UPDATE ON parts
    FOR EACH ROW
    EXECUTE FUNCTION protect_part_reservation();

-- 3. Reserve the parts of an order (all-or-nothing)
-- Returns: { ok, conflictPartIds[], staleOrderIds[] }
--   conflictPartIds: sold, deleted, withdrawn or reserved by another live order
--   staleOrderIds:   other orders whose reservation expired; the caller must cancel
--                    their PaymentIntents and call release_order_reservations first
CREATE OR REPLACE FUNCTION reserve_parts_for_order(
    p_order_id UUID,
    p_part_ids UUID[],
    p_ttl_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_conflicts UUID[] := '{}';
    v_stale UUID[] := '{}';
    v_found INTEGER;
    r RECORD;
BEGIN
    IF p_ttl_minutes IS NULL OR p_ttl_minutes < 1 OR p_ttl_minutes > 120 THEN
        RAISE EXCEPTION 'p_ttl_minutes must be between 1 and 120';
    END IF;

    v_found := 0;
    FOR r IN
        SELECT id, availability_status, deleted_at, reserved_order_id, reserved_until, sold_order_id
        FROM parts
        WHERE id = ANY(p_part_ids)
        ORDER BY id
        FOR UPDATE
    LOOP
        v_found := v_found + 1;
        IF r.sold_order_id IS NOT NULL
           OR r.deleted_at IS NOT NULL
           OR r.availability_status NOT IN ('AVAILABLE', 'RESERVED') THEN
            v_conflicts := v_conflicts || r.id;
        ELSIF r.reserved_order_id IS NOT NULL AND r.reserved_order_id <> p_order_id THEN
            IF r.reserved_until IS NOT NULL AND r.reserved_until < now() THEN
                IF NOT (r.reserved_order_id = ANY(v_stale)) THEN
                    v_stale := v_stale || r.reserved_order_id;
                END IF;
            ELSE
                v_conflicts := v_conflicts || r.id;
            END IF;
        ELSIF r.reserved_order_id IS NULL AND r.availability_status <> 'AVAILABLE' THEN
            v_conflicts := v_conflicts || r.id;
        END IF;
    END LOOP;

    IF v_found <> COALESCE(array_length(p_part_ids, 1), 0) THEN
        SELECT COALESCE(array_agg(x), '{}') INTO v_conflicts
        FROM (
            SELECT unnest(v_conflicts) AS x
            UNION
            SELECT pid FROM unnest(p_part_ids) AS pid WHERE NOT EXISTS (SELECT 1 FROM parts WHERE id = pid)
        ) s;
    END IF;

    IF array_length(v_conflicts, 1) > 0 OR array_length(v_stale, 1) > 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'conflictPartIds', to_jsonb(v_conflicts),
            'staleOrderIds', to_jsonb(v_stale)
        );
    END IF;

    PERFORM set_config('app.reservation_write', 'on', true);

    UPDATE parts
    SET availability_status = 'RESERVED',
        reserved_order_id = p_order_id,
        reserved_until = now() + make_interval(mins => p_ttl_minutes),
        updated_at = now()
    WHERE id = ANY(p_part_ids);

    PERFORM set_config('app.reservation_write', 'off', true);
    RETURN jsonb_build_object('ok', true, 'conflictPartIds', '[]'::jsonb, 'staleOrderIds', '[]'::jsonb);
END;
$$;

-- 4. Release every part an unpaid order holds
CREATE OR REPLACE FUNCTION release_order_reservations(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    PERFORM set_config('app.reservation_write', 'on', true);

    UPDATE parts
    SET availability_status = CASE WHEN availability_status = 'RESERVED' THEN 'AVAILABLE' ELSE availability_status END,
        reserved_order_id = NULL,
        reserved_until = NULL,
        updated_at = now()
    WHERE reserved_order_id = p_order_id
      AND sold_order_id IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM set_config('app.reservation_write', 'off', true);
    RETURN v_count;
END;
$$;

-- 5. Mark the parts of a paid order as sold
-- Returns the part ids that could not be marked because another order already bought them.
CREATE OR REPLACE FUNCTION mark_order_parts_sold(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_conflicts UUID[];
BEGIN
    PERFORM set_config('app.reservation_write', 'on', true);

    UPDATE parts p
    SET sold_order_id = p_order_id,
        availability_status = 'OUT_OF_STOCK',
        reserved_order_id = NULL,
        reserved_until = NULL,
        updated_at = now()
    FROM order_items oi
    JOIN order_suborders s ON s.id = oi.suborder_id
    WHERE s.order_id = p_order_id
      AND oi.part_id = p.id
      AND (p.sold_order_id IS NULL OR p.sold_order_id = p_order_id);

    PERFORM set_config('app.reservation_write', 'off', true);

    SELECT COALESCE(array_agg(oi.part_id), '{}') INTO v_conflicts
    FROM order_items oi
    JOIN order_suborders s ON s.id = oi.suborder_id
    JOIN parts p ON p.id = oi.part_id
    WHERE s.order_id = p_order_id
      AND p.sold_order_id IS DISTINCT FROM p_order_id;

    RETURN jsonb_build_object('conflictPartIds', to_jsonb(v_conflicts));
END;
$$;

-- Functions are executable by PUBLIC by default: restrict them to the Edge Functions.
REVOKE ALL ON FUNCTION reserve_parts_for_order(UUID, UUID[], INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_order_reservations(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mark_order_parts_sold(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_part_reservation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_parts_for_order(UUID, UUID[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_order_reservations(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION mark_order_parts_sold(UUID) TO service_role;

-- 6. Public visibility: an expired reservation is listed again as AVAILABLE; sold parts never are
DROP POLICY IF EXISTS "Public read for available parts" ON parts;
CREATE POLICY "Public read for available parts"
    ON parts
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND sold_order_id IS NULL
        AND (
            availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')
            OR (availability_status = 'RESERVED' AND reserved_until < now())
        )
        AND vendor_id IN (SELECT id FROM vendors WHERE status = 'ACTIVE' AND cat_verified = true)
    );

DROP POLICY IF EXISTS "Public read for part vehicles" ON part_vehicles;
CREATE POLICY "Public read for part vehicles"
    ON part_vehicles
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts));

DROP POLICY IF EXISTS "Public read for part OEM references" ON part_oem_references;
CREATE POLICY "Public read for part OEM references"
    ON part_oem_references
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts));

DROP POLICY IF EXISTS "Public read for part images" ON part_images;
CREATE POLICY "Public read for part images"
    ON part_images
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts));
-- The sub-selects above run with the caller's RLS on parts, so they inherit the
-- "Public read for available parts" policy instead of duplicating it.

CREATE OR REPLACE VIEW public_catalog_parts
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
    p.id,
    p.vendor_id,
    p.external_part_id,
    p.source_sku,
    p.title,
    p.description,
    p.category_id,
    p.price_cents,
    p.currency,
    p.condition,
    p.tested_status,
    (CASE
        WHEN p.availability_status = 'RESERVED' THEN 'AVAILABLE'
        ELSE p.availability_status
    END)::VARCHAR(30) AS availability_status,
    p.stock_quantity,
    p.warranty_months,
    p.source_updated_at,
    p.last_synced_at,
    jsonb_build_object(
        'id', v.id,
        'legalName', v.legal_name,
        'tradeName', v.trade_name,
        'catAuthorizationCode', v.cat_authorization_code,
        'catVerified', v.cat_verified,
        'city', v.city,
        'province', v.province,
        'postalCode', v.postal_code,
        'warrantyMonths', v.warranty_months,
        'returnDays', v.return_days
    ) AS vendor,
    (
        SELECT jsonb_build_object(
            'make', pv.make,
            'model', pv.model,
            'generation', pv.generation,
            'yearFrom', pv.year_from,
            'yearTo', pv.year_to,
            'engineCode', pv.engine_code,
            'fuel', pv.fuel,
            'donorVehicleCode', pv.donor_vehicle_code
        )
        FROM part_vehicles pv
        WHERE pv.part_id = p.id
        LIMIT 1
    ) AS donor_vehicle,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'raw', por.raw_reference,
                    'normalized', por.normalized_reference,
                    'isPrimary', por.is_primary,
                    'referenceType', por.reference_type,
                    'brandName', por.brand_name
                ) ORDER BY por.is_primary DESC
            )
            FROM part_oem_references por
            WHERE por.part_id = p.id
        ),
        '[]'::jsonb
    ) AS oem_references,
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', pi.id,
                    'url', pi.url,
                    'sortOrder', pi.sort_order,
                    'isPrimary', pi.is_primary
                ) ORDER BY pi.sort_order ASC
            )
            FROM part_images pi
            WHERE pi.part_id = p.id
        ),
        '[]'::jsonb
    ) AS images
FROM parts p
JOIN vendors v ON p.vendor_id = v.id
WHERE p.deleted_at IS NULL
  AND p.sold_order_id IS NULL
  AND (
      p.availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')
      OR (p.availability_status = 'RESERVED' AND p.reserved_until < now())
  )
  AND v.status = 'ACTIVE'
  AND v.cat_verified = true;
