-- =============================================================================
-- Migration: 20261119000006_unpriced_parts_to_inquiry.sql
-- Description: Parts loaded by the early sync scripts with a missing provider price
--              were stored as AVAILABLE at 0 EUR, so they could be bought for the
--              shipping cost alone. They become inquiry-only, the same state
--              ingest_catalog_batch now gives to unpriced parts. A later sync that
--              brings a real price puts them back on sale.
--              Reserved or sold parts are left untouched.
-- =============================================================================

UPDATE parts
SET availability_status = 'PENDING_CONFIRMATION',
    updated_at = now()
WHERE price_cents = 0
  AND availability_status = 'AVAILABLE'
  AND deleted_at IS NULL
  AND reserved_order_id IS NULL
  AND sold_order_id IS NULL;
