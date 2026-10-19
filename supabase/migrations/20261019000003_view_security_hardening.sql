-- =============================================================================
-- Migration: 20261019000003_view_security_hardening.sql
-- Description: Harden public_catalog_parts view with security_invoker = true
--              and security_barrier = true. Strengthen RLS on parts to enforce
--              deleted_at IS NULL. Revoke all access to sensitive integration
--              and sync tables from public/anon/authenticated roles.
-- =============================================================================

-- 1. Strengthen RLS policy on parts table to enforce deleted_at IS NULL
DROP POLICY IF EXISTS "Public read for available parts" ON parts;
CREATE POLICY "Public read for available parts"
    ON parts
    FOR SELECT
    USING (
        availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')
        AND deleted_at IS NULL
        AND vendor_id IN (SELECT id FROM vendors WHERE status = 'ACTIVE' AND cat_verified = true)
    );

-- 2. Recreate public_catalog_parts view with security_invoker and security_barrier
DROP VIEW IF EXISTS public_catalog_parts CASCADE;
CREATE VIEW public_catalog_parts 
WITH (security_invoker = true, security_barrier = true) AS
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
    -- Vendor metadata (sanitized public fields only)
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

-- 3. Explicit permissions: Grant read-only access to view and underlying catalog tables
GRANT SELECT ON public_catalog_parts TO anon, authenticated;
GRANT SELECT ON parts, vendors, part_vehicles, part_oem_references, part_images TO anon, authenticated;

-- 4. Defense-in-depth: Revoke all mutation privileges on catalog tables from public roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON parts, vendors, part_vehicles, part_oem_references, part_images FROM anon, authenticated, public;

-- 5. Absolute isolation: Revoke all privileges on internal integration tables from public roles
REVOKE ALL ON source_integrations FROM anon, authenticated, public;
REVOKE ALL ON sync_logs FROM anon, authenticated, public;

-- 6. Service role privileges (for Edge Functions and administrative sync workers)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
