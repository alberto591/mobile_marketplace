-- =============================================================================
-- Migration: 20261119000002_public_column_grants.sql
-- Description: Stop exposing internal columns of vendors and parts to anon /
--              authenticated through PostgREST.
--
--   Both roles had SELECT on the whole tables (needed by the security_invoker
--   view), which also exposed vendors.stripe_account_id / stripe_* onboarding
--   state and parts.source_integration_id / source_url / raw_payload_hash /
--   reserved_order_id. They now get column-level SELECT on public data only.
--
--   NOTE: clients must list columns explicitly on these two tables
--   (select=* is rejected). The app only reads vendors with an explicit column
--   list and reads parts through public_catalog_parts.
-- =============================================================================

REVOKE SELECT ON vendors FROM anon, authenticated;
GRANT SELECT (
    id, slug, legal_name, trade_name, cat_authorization_code, cat_verified,
    city, province, postal_code, country, address_line,
    public_phone, public_email, website_url,
    warranty_months, return_days, shipping_estimate_days, shipping_policy_summary,
    status, average_rating, total_reviews, created_at, updated_at
) ON vendors TO anon, authenticated;

REVOKE SELECT ON parts FROM anon, authenticated;
GRANT SELECT (
    id, vendor_id, external_part_id, source_sku, title, description, category_id,
    price_cents, currency, condition, tested_status, availability_status,
    stock_quantity, lead_time_days, warranty_months,
    source_updated_at, last_synced_at, created_at, updated_at, deleted_at,
    -- Referenced by public_catalog_parts (security_invoker) to hide reserved / sold parts.
    -- For every row the public can see, sold_order_id is NULL.
    reserved_until, sold_order_id
) ON parts TO anon, authenticated;
