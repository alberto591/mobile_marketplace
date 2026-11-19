-- =============================================================================
-- Migration: 20261119000001_catalog_search_rpc.sql
-- Description: Server-side OEM / make / model search over the public catalog.
--
--   The app used to fetch the 100 most recently synced rows and filter by OEM
--   reference, make and model on the device, so any part outside those 100 rows
--   was reported as "not found". This function applies those filters in the
--   database; PostgREST filters, ordering and limit are applied on its result:
--
--     GET /rest/v1/rpc/search_public_catalog_parts?p_oem=6F0857508B&order=price_cents.asc&limit=100
--
--   Semantics match the app's filters:
--     * p_oem:   exact match on the normalized reference (uppercase, no separators).
--     * p_make / p_model: ignored when p_oem is given; parts without donor vehicle
--                data are kept; model matches when either name contains the other.
--   SECURITY INVOKER: runs with the caller's RLS, like the view itself.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_oem_normalized_reference ON part_oem_references(normalized_reference);

CREATE OR REPLACE FUNCTION search_public_catalog_parts(
    p_oem TEXT DEFAULT NULL,
    p_make TEXT DEFAULT NULL,
    p_model TEXT DEFAULT NULL
)
RETURNS SETOF public_catalog_parts
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT c.*
    FROM public_catalog_parts c
    WHERE (
            NULLIF(btrim(p_oem), '') IS NULL
            OR EXISTS (
                SELECT 1
                FROM part_oem_references r
                WHERE r.part_id = c.id
                  AND r.normalized_reference = upper(btrim(p_oem))
            )
          )
      AND (
            NULLIF(btrim(p_oem), '') IS NOT NULL
            OR NULLIF(btrim(p_make), '') IS NULL
            OR c.donor_vehicle IS NULL
            OR upper(btrim(c.donor_vehicle->>'make')) = upper(btrim(p_make))
          )
      AND (
            NULLIF(btrim(p_oem), '') IS NOT NULL
            OR NULLIF(btrim(p_model), '') IS NULL
            OR c.donor_vehicle IS NULL
            OR position(upper(btrim(p_model)) IN upper(btrim(c.donor_vehicle->>'model'))) > 0
            OR position(upper(btrim(c.donor_vehicle->>'model')) IN upper(btrim(p_model))) > 0
          );
$$;

REVOKE ALL ON FUNCTION search_public_catalog_parts(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_public_catalog_parts(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
