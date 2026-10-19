/**
 * Vehicle Entity and Donor Specifications.
 * Captures donor vehicle information extracted from scrapyard records.
 */
export type FuelType =
  | 'GASOLINE'
  | 'DIESEL'
  | 'HYBRID'
  | 'ELECTRIC'
  | 'LPG'
  | 'CNG'
  | 'OTHER';

export type TransmissionType =
  | 'MANUAL'
  | 'AUTOMATIC'
  | 'SEMI_AUTOMATIC'
  | 'OTHER';

export interface Vehicle {
  readonly make: string;
  readonly model: string;
  readonly generation?: string;
  readonly yearFrom?: number;
  readonly yearTo?: number;
  readonly engineCode?: string;
  readonly fuel?: FuelType;
  readonly powerKw?: number;
  readonly powerCv?: number;
  readonly displacementCc?: number;
  readonly transmission?: TransmissionType;
  readonly bodyType?: string;
  readonly doors?: number;
  readonly donorVinMasked?: string;
}

export interface VehicleTargetCriteria {
  readonly make: string;
  readonly model: string;
  readonly year?: number;
  readonly engineCode?: string;
  readonly fuel?: FuelType;
  readonly powerCv?: number;
}

/**
 * Normalizes vehicle brand name to standard format (e.g. "volkswagen" -> "VOLKSWAGEN").
 */
export function normalizeVehicleMake(make: string): string {
  return make.trim().toUpperCase();
}

/**
 * Normalizes vehicle model name to standard format.
 */
export function normalizeVehicleModel(model: string): string {
  return model.trim().toUpperCase();
}
