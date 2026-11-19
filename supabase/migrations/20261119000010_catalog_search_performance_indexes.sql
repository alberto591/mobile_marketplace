-- =============================================================================
-- Migration: 20261119000009_catalog_search_performance_indexes.sql
-- Description: Fix HTTP 500 statement timeout (57014) on public_catalog_parts
--              search queries (e.g. title=ilike.*Faro*).
--
--   Root causes:
--     1. part_vehicles, part_oem_references and part_images had no B-tree index
--        on part_id, causing 3 full sequential scans per row in the view's
--        correlated subqueries.
--     2. security_barrier = true on public_catalog_parts prevented PostgreSQL
--        from pushing non-leakproof predicates (such as ILIKE) down to
--        idx_parts_title_trgm, forcing full view materialization before filter.
--        Row-level access control is already enforced by security_invoker = true
--        and the underlying RLS policies on parts, vendors and sub-tables.
-- =============================================================================

-- 1. Missing FK indexes for the 3 correlated subqueries in public_catalog_parts
CREATE INDEX IF NOT EXISTS idx_part_vehicles_part_id
    ON part_vehicles(part_id);

CREATE INDEX IF NOT EXISTS idx_part_oem_references_part_id
    ON part_oem_references(part_id, is_primary DESC);

CREATE INDEX IF NOT EXISTS idx_part_images_part_id
    ON part_images(part_id, sort_order ASC);

-- 2. Partial index for default catalog ordering (last_synced_at DESC)
CREATE INDEX IF NOT EXISTS idx_parts_public_last_synced
    ON parts(last_synced_at DESC)
    WHERE deleted_at IS NULL AND sold_order_id IS NULL;

-- 3. Allow predicate pushdown (ILIKE -> idx_parts_title_trgm) while keeping
--    security_invoker = true so all underlying table RLS policies still apply.
ALTER VIEW public_catalog_parts SET (security_invoker = true, security_barrier = false);

ANALYZE parts;
ANALYZE part_vehicles;
ANALYZE part_oem_references;
ANALYZE part_images;
