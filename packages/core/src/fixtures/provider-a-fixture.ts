/**
 * Development Mock Fixtures - Provider A (Desguace Alpha).
 *
 * DISCLAIMER: These payloads are purely simulated test fixtures for development and testing.
 * They do NOT represent real production inventory or verified provider schemas.
 */

export interface RawProviderAPart {
  readonly id_recambio: string;
  readonly denominacion: string;
  readonly descripcion_adicional?: string;
  readonly categoria_codigo: string;
  readonly precio_neto: number; // in Euros
  readonly iva_incluido: boolean;
  readonly estado_calidad: 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'DESPIECE';
  readonly comprobado: boolean;
  readonly disponible: boolean;
  readonly cantidad: number;
  readonly ref_oem_principal?: string;
  readonly refs_equivalentes?: string[];
  readonly vehiculo_donante?: {
    readonly marca: string;
    readonly modelo: string;
    readonly version?: string;
    readonly anio?: number;
    readonly codigo_motor?: string;
    readonly combustible?: string;
    readonly bastidor_anonimizado?: string;
  };
  readonly fotos_urls?: string[];
  readonly meses_garantia?: number;
  readonly fecha_modificacion?: string;
}

/**
 * 1. Piece with complete data
 */
export const MOCK_PROVIDER_A_COMPLETE: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1001",
  denominacion: "Faro Principal Izquierdo Halógeno",
  descripcion_adicional: "Faro delantero izquierdo en perfecto estado, óptica transparente sin roturas ni patillas partidas",
  categoria_codigo: "ILUMINACION_FARO_IZQ",
  precio_neto: 85.00,
  iva_incluido: true,
  estado_calidad: "BUENO",
  comprobado: true,
  disponible: true,
  cantidad: 1,
  ref_oem_principal: "1K0-941-005.Q",
  refs_equivalentes: ["1K0941005Q", "1K0 941 005 Q"],
  vehiculo_donante: {
    marca: "VOLKSWAGEN",
    modelo: "GOLF V (1K1)",
    version: "1.9 TDI Highline",
    anio: 2006,
    codigo_motor: "BKC",
    combustible: "DIESEL",
    bastidor_anonimizado: "WVWZZZ1KZ6W******"
  },
  fotos_urls: [
    "https://example-alpha.test/photos/1001_front.webp",
    "https://example-alpha.test/photos/1001_back.webp",
    "https://example-alpha.test/photos/1001_label.webp"
  ],
  meses_garantia: 12,
  fecha_modificacion: "2026-10-18T10:00:00.000Z"
};

/**
 * 2. Piece with missing optional fields (no vehicle, no warranty, no secondary refs)
 */
export const MOCK_PROVIDER_A_MINIMAL: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1002",
  denominacion: "Retrovisor Derecho Eléctrico Imprimado",
  categoria_codigo: "CARROCERIA_RETROVISOR_DCH",
  precio_neto: 42.50,
  iva_incluido: true,
  estado_calidad: "REGULAR",
  comprobado: false,
  disponible: true,
  cantidad: 1,
  ref_oem_principal: "8E1858532",
  fotos_urls: [
    "https://example-alpha.test/photos/1002_main.webp"
  ]
};

/**
 * 3. Offer sharing OEM reference (1K0121205AD - Radiador refrigeración motor)
 */
export const MOCK_PROVIDER_A_SHARED_OEM: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1003",
  denominacion: "Radiador de Agua Refrigeración Motor",
  categoria_codigo: "REFRIGERACION_RADIADOR",
  precio_neto: 65.00,
  iva_incluido: true,
  estado_calidad: "BUENO",
  comprobado: true,
  disponible: true,
  cantidad: 1,
  ref_oem_principal: "1K0-121-205 AD",
  vehiculo_donante: {
    marca: "SEAT",
    modelo: "LEON (1P1)",
    anio: 2008,
    codigo_motor: "BXE",
    combustible: "DIESEL"
  },
  fotos_urls: [
    "https://example-alpha.test/photos/1003_radiator.webp"
  ],
  meses_garantia: 12
};

/**
 * 4. Piece with unverified compatibility (no OEM reference, only loose text)
 */
export const MOCK_PROVIDER_A_UNVERIFIED_COMPAT: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1004",
  denominacion: "Parasol Izquierdo Gris Con Espejo",
  categoria_codigo: "INTERIOR_PARASOL_IZQ",
  precio_neto: 18.00,
  iva_incluido: true,
  estado_calidad: "BUENO",
  comprobado: true,
  disponible: true,
  cantidad: 1,
  // No OEM reference provided
  vehiculo_donante: {
    marca: "RENAULT",
    modelo: "CLIO III",
    anio: 2007
  },
  fotos_urls: [
    "https://example-alpha.test/photos/1004_sunvisor.webp"
  ]
};

/**
 * 5. Piece without any photographs
 */
export const MOCK_PROVIDER_A_NO_IMAGES: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1005",
  denominacion: "Mando Elevalunas Delantero Izquierdo",
  categoria_codigo: "ELECTRICIDAD_MANDO_ELEVALUNAS",
  precio_neto: 25.00,
  iva_incluido: true,
  estado_calidad: "BUENO",
  comprobado: true,
  disponible: true,
  cantidad: 1,
  ref_oem_principal: "1J4959857D",
  fotos_urls: [] // Empty photo gallery
};

/**
 * 6. Piece that has ceased to be available (out of stock)
 */
export const MOCK_PROVIDER_A_OUT_OF_STOCK: RawProviderAPart = {
  id_recambio: "ALPHA-PART-1006",
  denominacion: "Alternador 140A Bosch",
  categoria_codigo: "ELECTRICIDAD_ALTERNADOR",
  precio_neto: 110.00,
  iva_incluido: true,
  estado_calidad: "EXCELENTE",
  comprobado: true,
  disponible: false, // SOLD / OUT OF STOCK
  cantidad: 0,
  ref_oem_principal: "0281002500"
};

/**
 * 7. Paginated batch fixture (Page 1)
 */
export const MOCK_PROVIDER_A_PAGE_1: readonly RawProviderAPart[] = [
  MOCK_PROVIDER_A_COMPLETE,
  MOCK_PROVIDER_A_MINIMAL,
  MOCK_PROVIDER_A_SHARED_OEM,
];

/**
 * Paginated batch fixture (Page 2)
 */
export const MOCK_PROVIDER_A_PAGE_2: readonly RawProviderAPart[] = [
  MOCK_PROVIDER_A_UNVERIFIED_COMPAT,
  MOCK_PROVIDER_A_NO_IMAGES,
  MOCK_PROVIDER_A_OUT_OF_STOCK,
];

/**
 * 8. Malformed / Invalid payload triggering structured validation errors
 */
export const MOCK_PROVIDER_A_INVALID = {
  id_recambio: "", // Error: Empty external ID
  denominacion: "X", // Error: Title too short (<2 chars)
  precio_neto: -50.0, // Error: Negative price
  fotos_urls: ["not-a-valid-url"], // Error: Invalid URL
};
