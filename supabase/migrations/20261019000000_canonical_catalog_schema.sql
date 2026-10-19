-- =============================================================================
-- Migration: 20261019000000_canonical_catalog_schema.sql
-- Description: Canonical schema for scrap yard auto parts marketplace.
-- Authors: Principal Software Architect / Senior TypeScript Engineer
--
-- PENDING VALIDATIONS WITH REAL VENDOR APIS:
-- 1. Exact structure and volatility of image URLs (hotlinking vs Supabase Storage).
-- 2. Granularity of vehicle donor identifiers (need for donor chassis/VIN storage).
-- 3. Webhook callback tokens vs polling credentials in source_integrations.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -----------------------------------------------------------------------------
-- 1. Table: vendors (Centros Autorizados de Tratamiento - CAT / Desguaces)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    legal_name TEXT NOT NULL,
    trade_name TEXT NOT NULL,
    cat_authorization_code VARCHAR(100) NOT NULL UNIQUE,
    cat_verified BOOLEAN NOT NULL DEFAULT false,
    city TEXT NOT NULL,
    province TEXT NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    country VARCHAR(2) NOT NULL DEFAULT 'ES',
    address_line TEXT,
    public_phone TEXT,
    public_email TEXT,
    website_url TEXT,
    warranty_months INTEGER NOT NULL DEFAULT 12 CHECK (warranty_months >= 12),
    return_days INTEGER NOT NULL DEFAULT 14 CHECK (return_days >= 14),
    shipping_estimate_days INTEGER,
    shipping_policy_summary TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    average_rating NUMERIC(3,2) CHECK (average_rating >= 0 AND average_rating <= 5),
    total_reviews INTEGER NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 2. Table: source_integrations (Internal provider sync configuration & secrets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    provider_type VARCHAR(60) NOT NULL, -- e.g. 'adapter_provider_alpha', 'adapter_provider_beta'
    base_url TEXT,
    api_key_encrypted TEXT,             -- Sensitive credential; never exposed to public
    rate_limit_per_minute INTEGER DEFAULT 60 CHECK (rate_limit_per_minute > 0),
    sync_status VARCHAR(20) NOT NULL DEFAULT 'IDLE' CHECK (sync_status IN ('IDLE', 'SYNCING', 'FAILED', 'PAUSED')),
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_cursor TEXT,
    error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 3. Table: parts (Individual inventory unit; physically unique)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    source_integration_id UUID NOT NULL REFERENCES source_integrations(id) ON DELETE RESTRICT,
    external_part_id VARCHAR(120) NOT NULL,
    source_sku VARCHAR(120),
    title TEXT NOT NULL,
    description TEXT,
    category_id VARCHAR(80) NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    condition VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (condition IN ('EXCELLENT', 'GOOD', 'FAIR', 'FOR_REPAIR', 'UNKNOWN')),
    tested_status VARCHAR(20) NOT NULL DEFAULT 'NOT_TESTED' CHECK (tested_status IN ('TESTED_WORKING', 'NOT_TESTED', 'TESTED_DEFECTIVE')),
    availability_status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'OUT_OF_STOCK', 'RESERVED', 'PENDING_CONFIRMATION', 'WITHDRAWN')),
    stock_quantity INTEGER NOT NULL DEFAULT 1 CHECK (stock_quantity >= 0),
    lead_time_days INTEGER,
    warranty_months INTEGER NOT NULL DEFAULT 12 CHECK (warranty_months >= 0),
    source_url TEXT,
    raw_payload_hash VARCHAR(64),
    source_updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- Idempotency constraint: identical external part ID from same vendor cannot duplicate
    CONSTRAINT uq_vendor_external_part UNIQUE (vendor_id, external_part_id)
);

-- -----------------------------------------------------------------------------
-- 4. Table: part_vehicles (Donor vehicle specifications)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS part_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    make VARCHAR(80) NOT NULL,
    model VARCHAR(80) NOT NULL,
    generation VARCHAR(80),
    year_from INTEGER CHECK (year_from >= 1950 AND year_from <= 2100),
    year_to INTEGER CHECK (year_to >= 1950 AND year_to <= 2100),
    engine_code VARCHAR(40),
    fuel VARCHAR(20) CHECK (fuel IN ('GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC', 'LPG', 'CNG', 'OTHER')),
    power_kw NUMERIC(6,2),
    power_cv NUMERIC(6,2),
    displacement_cc INTEGER,
    transmission VARCHAR(20) CHECK (transmission IN ('MANUAL', 'AUTOMATIC', 'SEMI_AUTOMATIC', 'OTHER')),
    body_type VARCHAR(50),
    doors INTEGER,
    donor_vin_masked VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 5. Table: part_oem_references (Normalized OEM references)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS part_oem_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    raw_reference VARCHAR(100) NOT NULL,
    normalized_reference VARCHAR(100) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    brand_name VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_part_normalized_oem UNIQUE (part_id, normalized_reference)
);

-- -----------------------------------------------------------------------------
-- 6. Table: part_images (Real unit photographs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS part_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 7. Table: sync_logs (Batch execution audit log)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_integration_id UUID NOT NULL REFERENCES source_integrations(id) ON DELETE CASCADE,
    batch_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    total_processed INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    unchanged_count INTEGER NOT NULL DEFAULT 0,
    deactivated_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    error_summary JSONB DEFAULT '[]'::jsonb,
    is_complete_run BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- =============================================================================
-- INDEXES FOR FAST CATALOG RETRIEVAL AND SEARCH
-- =============================================================================

-- Fast lookups by vendor, availability, category and sync timestamps
CREATE INDEX IF NOT EXISTS idx_parts_vendor_avail ON parts(vendor_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_parts_category_avail ON parts(category_id, availability_status);
CREATE INDEX IF NOT EXISTS idx_parts_last_synced ON parts(last_synced_at);

-- High-precision OEM reference index
CREATE INDEX IF NOT EXISTS idx_oem_normalized ON part_oem_references(normalized_reference);

-- Vehicle compatibility filter indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model_year ON part_vehicles(make, model, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_vehicles_engine_code ON part_vehicles(engine_code);

-- Trigram GIN indexes for typo-tolerant fuzzy matching
CREATE INDEX IF NOT EXISTS idx_parts_title_trgm ON parts USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_oem_trgm ON part_oem_references USING GIN (normalized_reference gin_trgm_ops);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_oem_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policy: Vendors (Active and Verified only)
CREATE POLICY "Public read for active verified vendors"
    ON vendors
    FOR SELECT
    USING (status = 'ACTIVE' AND cat_verified = true);

-- 2. Public Read Policy: Parts (Available or in active catalog)
CREATE POLICY "Public read for available parts"
    ON parts
    FOR SELECT
    USING (
        availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')
        AND vendor_id IN (SELECT id FROM vendors WHERE status = 'ACTIVE' AND cat_verified = true)
    );

-- 3. Public Read Policy: Part Sub-entities
CREATE POLICY "Public read for part vehicles"
    ON part_vehicles
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts WHERE availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')));

CREATE POLICY "Public read for part OEM references"
    ON part_oem_references
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts WHERE availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')));

CREATE POLICY "Public read for part images"
    ON part_images
    FOR SELECT
    USING (part_id IN (SELECT id FROM parts WHERE availability_status IN ('AVAILABLE', 'PENDING_CONFIRMATION')));

-- 4. Service Role Restricted: Source Integrations and Sync Logs
-- Anonymous and standard authenticated mobile users CANNOT view or query integration secrets or logs
CREATE POLICY "Service role full access on source_integrations"
    ON source_integrations
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on sync_logs"
    ON sync_logs
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Service Role Write Policies: Ingestion and Catalog Updates
CREATE POLICY "Service role write on vendors"
    ON vendors TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role write on parts"
    ON parts TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role write on part_vehicles"
    ON part_vehicles TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role write on part_oem_references"
    ON part_oem_references TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role write on part_images"
    ON part_images TO service_role USING (true) WITH CHECK (true);
