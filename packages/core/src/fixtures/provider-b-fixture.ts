/**
 * Development Mock Fixtures - Provider B (Desguace Beta).
 *
 * DISCLAIMER: These payloads are purely simulated test fixtures for development and testing.
 * They do NOT represent real production inventory or verified provider schemas.
 */

export interface RawProviderBPart {
  readonly item_code: string;
  readonly title: string;
  readonly part_type: string;
  readonly amount_cents: number;
  readonly currency: string;
  readonly grade: 'A' | 'B' | 'C' | 'REBUILD';
  readonly is_tested: boolean;
  readonly stock_level: number;
  readonly oe_code?: string;
  readonly extra_oe?: string[];
  readonly donor_vehicle?: {
    readonly make: string;
    readonly model: string;
    readonly year?: number;
    readonly motor_code?: string;
    readonly fuel_type?: string;
  };
  readonly images?: string[];
  readonly warranty_days?: number;
  readonly updated_timestamp?: number;
}

/**
 * Offer from Provider B sharing OEM reference (1K0121205AD) with Provider A
 * Proves that multiple scrap yards with the same part reference are independently preserved.
 */
export const MOCK_PROVIDER_B_SHARED_OEM: RawProviderBPart = {
  item_code: "BETA-ITEM-9001",
  title: "Engine Cooling Water Radiator",
  part_type: "ENGINE_COOLING_RADIATOR",
  amount_cents: 5500, // 55.00 EUR (cheaper than Alpha's 65.00 EUR)
  currency: "EUR",
  grade: "A", // Excellent condition
  is_tested: true,
  stock_level: 1,
  oe_code: "1K0.121.205.AD", // Matches Alpha's "1K0-121-205 AD"
  extra_oe: ["1K0121205AD", "1K0121205 AD"],
  donor_vehicle: {
    make: "AUDI",
    model: "A3 (8P1)",
    year: 2007,
    motor_code: "BKC",
    fuel_type: "DIESEL"
  },
  images: [
    "https://example-beta.test/images/9001_radiator_front.jpg",
    "https://example-beta.test/images/9001_radiator_core.jpg"
  ],
  warranty_days: 365,
  updated_timestamp: 1729330000000
};

export const MOCK_PROVIDER_B_COMPLETE: RawProviderBPart = {
  item_code: "BETA-ITEM-9002",
  title: "Front Brake Caliper Right",
  part_type: "BRAKES_CALIPER_FR",
  amount_cents: 4500,
  currency: "EUR",
  grade: "B",
  is_tested: true,
  stock_level: 1,
  oe_code: "1K0615124E",
  donor_vehicle: {
    make: "VOLKSWAGEN",
    model: "GOLF V",
    year: 2005,
    motor_code: "BGU"
  },
  images: ["https://example-beta.test/images/9002_caliper.jpg"],
  warranty_days: 365
};

export const MOCK_PROVIDER_B_PAGE_1: readonly RawProviderBPart[] = [
  MOCK_PROVIDER_B_SHARED_OEM,
  MOCK_PROVIDER_B_COMPLETE,
];
