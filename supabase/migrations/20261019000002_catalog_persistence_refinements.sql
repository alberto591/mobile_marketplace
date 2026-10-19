-- =============================================================================
-- Migration: 20261019000002_catalog_persistence_refinements.sql
-- Description: Add donor_vehicle_code, reference_type, and deleted_at columns
--              to support full Eurodesguace Málaga mapping, and define secure
--              public read view for catalog queries.
-- =============================================================================

-- 1. Add donor_vehicle_code to part_vehicles if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'part_vehicles' AND column_name = 'donor_vehicle_code'
    ) THEN
        ALTER TABLE part_vehicles ADD COLUMN donor_vehicle_code VARCHAR(80);
    END IF;
END $$;

-- 2. Add reference_type to part_oem_references to explicitly distinguish visual references
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'part_oem_references' AND column_name = 'reference_type'
    ) THEN
        ALTER TABLE part_oem_references 
        ADD COLUMN reference_type VARCHAR(40) DEFAULT 'OEM_OFFICIAL' 
        CHECK (reference_type IN ('OEM_OFFICIAL', 'REFERENCIA_VISUAL', 'CATALOGO_PROVEEDOR', 'CROSS_REFERENCE'));
    END IF;
END $$;

-- 3. Add deleted_at to parts to track logical deletion from vendor catalog
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'parts' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE parts ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- 4. Secure Public Catalog View
-- Aggregates only public part information, sanitizing private integration data
CREATE OR REPLACE VIEW public_catalog_parts AS
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
    p.availability_status,
    p.stock_quantity,
    p.warranty_months,
    p.source_updated_at,
    p.last_synced_at,
    -- Vendor metadata (sanitized public)
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
    -- Donor vehicle metadata
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
    -- Associated OEM and visual references
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
    -- Associated photographs ordered by sortOrder
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
WHERE p.availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')
  AND p.deleted_at IS NULL
  AND v.status = 'ACTIVE'
  AND v.cat_verified = true;

-- 5. Grant read-only access to view for anonymous and authenticated users
GRANT SELECT ON public_catalog_parts TO anon, authenticated, service_role;
