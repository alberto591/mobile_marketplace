-- =============================================================================
-- Migration: 20261119000004_catalog_ingest_rpc.sql
-- Description: Persist one synchronized provider batch in a single transaction.
--
--   The eurodesguace-sync Edge Function used to fetch a batch from the provider and
--   only return counters, so the scheduled sync never changed the catalog. It now
--   normalizes the batch and calls this function, which:
--     * upserts the parts (idempotent on vendor_id + external_part_id),
--     * replaces their donor vehicle and photos, upserts their visual/OEM reference,
--     * advances the integration cursor (NULL = start a new full pass next time),
--     * writes the sync_logs audit row.
--   Either the whole batch and the cursor move forward, or nothing does.
--
--   Reserved and sold parts are protected by trg_protect_part_reservation: a sync
--   cannot put them back on sale.
--
--   p_parts: JSON array of
--     { externalPartId, sourceSku, title, categoryId, priceCents, isDeleted, deletedAt,
--       sourceUrl, make, model, donorVehicleCode, referenceRaw, referenceNormalized,
--       referenceType, images: [url, ...] }
-- =============================================================================

CREATE OR REPLACE FUNCTION ingest_catalog_batch(
    p_integration_id UUID,
    p_parts JSONB,
    p_next_cursor TEXT,
    p_started_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_vendor_id UUID;
    v_total INTEGER;
    v_created INTEGER;
    v_updated INTEGER;
    v_deactivated INTEGER;
    v_needs_price INTEGER;
BEGIN
    SELECT vendor_id INTO v_vendor_id FROM source_integrations WHERE id = p_integration_id FOR UPDATE;
    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'source integration % not found', p_integration_id;
    END IF;

    DROP TABLE IF EXISTS _ingest_input;
    CREATE TEMP TABLE _ingest_input ON COMMIT DROP AS
    SELECT DISTINCT ON (x."externalPartId")
        x."externalPartId"                         AS external_part_id,
        NULLIF(x."sourceSku", '')                  AS source_sku,
        x.title,
        COALESCE(NULLIF(x."categoryId", ''), 'GENERAL') AS category_id,
        GREATEST(COALESCE(x."priceCents", 0), 0)   AS price_cents,
        COALESCE(x."isDeleted", false)             AS is_deleted,
        x."deletedAt"                              AS deleted_at,
        NULLIF(x."sourceUrl", '')                  AS source_url,
        NULLIF(btrim(x.make), '')                  AS make,
        NULLIF(btrim(x.model), '')                 AS model,
        NULLIF(x."donorVehicleCode", '')           AS donor_vehicle_code,
        NULLIF(x."referenceRaw", '')               AS reference_raw,
        NULLIF(x."referenceNormalized", '')        AS reference_normalized,
        COALESCE(NULLIF(x."referenceType", ''), 'REFERENCIA_VISUAL') AS reference_type,
        COALESCE(x.images, '[]'::jsonb)            AS images
    FROM jsonb_to_recordset(COALESCE(p_parts, '[]'::jsonb)) AS x(
        "externalPartId" TEXT, "sourceSku" TEXT, title TEXT, "categoryId" TEXT, "priceCents" INTEGER,
        "isDeleted" BOOLEAN, "deletedAt" TIMESTAMPTZ, "sourceUrl" TEXT, make TEXT, model TEXT,
        "donorVehicleCode" TEXT, "referenceRaw" TEXT, "referenceNormalized" TEXT, "referenceType" TEXT,
        images JSONB
    )
    WHERE NULLIF(x."externalPartId", '') IS NOT NULL
      AND NULLIF(btrim(x.title), '') IS NOT NULL;

    SELECT count(*), count(*) FILTER (WHERE is_deleted), count(*) FILTER (WHERE NOT is_deleted AND price_cents = 0)
    INTO v_total, v_deactivated, v_needs_price
    FROM _ingest_input;

    DROP TABLE IF EXISTS _ingest_parts;
    CREATE TEMP TABLE _ingest_parts ON COMMIT DROP AS
    WITH up AS (
        INSERT INTO parts (
            vendor_id, source_integration_id, external_part_id, source_sku, title, category_id,
            price_cents, currency, condition, tested_status, availability_status, stock_quantity,
            warranty_months, source_url, deleted_at, source_updated_at, last_synced_at
        )
        SELECT
            v_vendor_id, p_integration_id, i.external_part_id, COALESCE(i.source_sku, i.external_part_id),
            i.title, i.category_id, i.price_cents, 'EUR', 'GOOD', 'TESTED_WORKING',
            -- A part without a usable price cannot be bought directly: it goes through an inquiry.
            CASE WHEN i.is_deleted THEN 'OUT_OF_STOCK'
                 WHEN i.price_cents = 0 THEN 'PENDING_CONFIRMATION'
                 ELSE 'AVAILABLE' END,
            CASE WHEN i.is_deleted THEN 0 ELSE 1 END,
            12, i.source_url, CASE WHEN i.is_deleted THEN COALESCE(i.deleted_at, now()) END, now(), now()
        FROM _ingest_input i
        ON CONFLICT (vendor_id, external_part_id) DO UPDATE SET
            source_sku = EXCLUDED.source_sku,
            title = EXCLUDED.title,
            category_id = EXCLUDED.category_id,
            price_cents = EXCLUDED.price_cents,
            availability_status = EXCLUDED.availability_status,
            stock_quantity = EXCLUDED.stock_quantity,
            source_url = EXCLUDED.source_url,
            deleted_at = EXCLUDED.deleted_at,
            source_updated_at = EXCLUDED.source_updated_at,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = now()
        RETURNING id, external_part_id, (xmax = 0) AS inserted
    )
    SELECT * FROM up;

    SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
    INTO v_created, v_updated
    FROM _ingest_parts;

    -- Donor vehicle: replace when the provider sent make and model
    DELETE FROM part_vehicles pv
    USING _ingest_parts p
    JOIN _ingest_input i ON i.external_part_id = p.external_part_id
    WHERE pv.part_id = p.id AND i.make IS NOT NULL AND i.model IS NOT NULL;

    INSERT INTO part_vehicles (part_id, make, model, donor_vehicle_code)
    SELECT p.id, left(i.make, 80), left(i.model, 80), left(i.donor_vehicle_code, 80)
    FROM _ingest_parts p
    JOIN _ingest_input i ON i.external_part_id = p.external_part_id
    WHERE i.make IS NOT NULL AND i.model IS NOT NULL;

    -- Reference read on the part (never promoted to a verified OEM reference here)
    INSERT INTO part_oem_references (part_id, raw_reference, normalized_reference, is_primary, reference_type)
    SELECT p.id, left(i.reference_raw, 100), left(i.reference_normalized, 100), true, i.reference_type
    FROM _ingest_parts p
    JOIN _ingest_input i ON i.external_part_id = p.external_part_id
    WHERE i.reference_raw IS NOT NULL AND i.reference_normalized IS NOT NULL
    ON CONFLICT (part_id, normalized_reference) DO UPDATE SET
        raw_reference = EXCLUDED.raw_reference,
        is_primary = EXCLUDED.is_primary,
        reference_type = EXCLUDED.reference_type;

    -- Photos: replace when the provider sent any
    DELETE FROM part_images pi
    USING _ingest_parts p
    JOIN _ingest_input i ON i.external_part_id = p.external_part_id
    WHERE pi.part_id = p.id AND jsonb_array_length(i.images) > 0;

    INSERT INTO part_images (part_id, url, sort_order, is_primary)
    SELECT p.id, img.url, (img.ord - 1)::INTEGER, img.ord = 1
    FROM _ingest_parts p
    JOIN _ingest_input i ON i.external_part_id = p.external_part_id
    CROSS JOIN LATERAL jsonb_array_elements_text(i.images) WITH ORDINALITY AS img(url, ord)
    WHERE NULLIF(btrim(img.url), '') IS NOT NULL;

    UPDATE source_integrations
    SET last_cursor = NULLIF(p_next_cursor, ''),
        last_attempt_at = p_started_at,
        last_success_at = now(),
        sync_status = 'IDLE',
        error_summary = NULL,
        updated_at = now()
    WHERE id = p_integration_id;

    INSERT INTO sync_logs (
        source_integration_id, batch_id, started_at, completed_at, total_processed,
        created_count, updated_count, unchanged_count, deactivated_count, failed_count,
        error_summary, is_complete_run
    ) VALUES (
        p_integration_id,
        'batch_' || to_char(p_started_at AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS') || '_' || v_total,
        p_started_at, now(), v_total, v_created, v_updated, 0, v_deactivated, 0,
        '[]'::jsonb,
        NULLIF(p_next_cursor, '') IS NULL
    );

    RETURN jsonb_build_object(
        'processed', v_total,
        'created', v_created,
        'updated', v_updated,
        'deactivated', v_deactivated,
        'needsPriceConfirmation', v_needs_price,
        'catalogPassComplete', NULLIF(p_next_cursor, '') IS NULL
    );
END;
$$;

REVOKE ALL ON FUNCTION ingest_catalog_batch(UUID, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_catalog_batch(UUID, JSONB, TEXT, TIMESTAMPTZ) TO service_role;
