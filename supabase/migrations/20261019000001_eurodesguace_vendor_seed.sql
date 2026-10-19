-- =============================================================================
-- Migration: 20261019000001_eurodesguace_vendor_seed.sql
-- Description: Register Eurodesguace Málaga as official CAT vendor and configure
--              its source_integrations profile and sync audit capabilities.
-- =============================================================================

-- 1. Insert Eurodesguace Málaga as authorized scrap yard vendor
INSERT INTO vendors (
    id,
    slug,
    legal_name,
    trade_name,
    cat_authorization_code,
    cat_verified,
    city,
    province,
    postal_code,
    country,
    address_line,
    public_phone,
    public_email,
    website_url,
    warranty_months,
    return_days,
    shipping_estimate_days,
    shipping_policy_summary,
    status,
    average_rating,
    total_reviews
) VALUES (
    '00000000-0000-4000-a000-000000000101'::uuid,
    'eurodesguace-malaga',
    'Eurodesguace Málaga S.L.',
    'Eurodesguace Málaga',
    'CAT/AND/MA/0412',
    true,
    'Málaga',
    'Málaga',
    '29004',
    'ES',
    'Polígono Industrial Guadalhorce, Calle Esteban Salazar Chapela',
    '+34 952 000 000',
    'info@eurodesguacemalaga.com',
    'https://eurodesguacemalaga.com',
    12, -- Conforme a garantía legal para recambios de CAT
    14, -- Derecho legal de desistimiento
    2,
    'Envíos en 24-48h a toda España peninsular. Garantía de 1 año.',
    'ACTIVE',
    4.7,
    185
) ON CONFLICT (cat_authorization_code) DO UPDATE SET
    trade_name = EXCLUDED.trade_name,
    status = EXCLUDED.status,
    updated_at = timezone('utc', now());

-- 2. Register source integration configuration
INSERT INTO source_integrations (
    id,
    vendor_id,
    provider_type,
    base_url,
    rate_limit_per_minute,
    sync_status,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-4000-a000-000000000201'::uuid,
    '00000000-0000-4000-a000-000000000101'::uuid,
    'eurodesguace_malaga',
    'https://eurodesguacemalaga.com/api/v1',
    120, -- Cuota documentada: 120 req/min
    'IDLE',
    timezone('utc', now()),
    timezone('utc', now())
) ON CONFLICT (id) DO NOTHING;
