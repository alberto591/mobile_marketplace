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

-- 2. Non-destructive hardening of public_catalog_parts view options
-- Modifies reloptions in-place to enforce calling role's RLS and prevent predicate pushdown leakage
ALTER VIEW public_catalog_parts SET (security_invoker = true, security_barrier = true);

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
