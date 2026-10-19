import type { OEMReference } from './oem-reference.js';
import { areOEMReferencesEqual } from './oem-reference.js';
import type { Vehicle, VehicleTargetCriteria } from './vehicle.js';
import { normalizeVehicleMake, normalizeVehicleModel } from './vehicle.js';

/**
 * Compatibility Confidence Levels.
 * Explicitly distinguishes mathematically/officially verified compatibility
 * from mere attribute coincidences or unknown states.
 */
export type CompatibilityConfidence =
  | 'EXACT_OEM_MATCH'
  | 'CATALOG_VERIFIED'
  | 'ATTRIBUTES_MATCH'
  | 'UNKNOWN_PENDING_CONFIRMATION';

export type CompatibilityEvidenceSource =
  | 'OEM_EXACT_REFERENCE'
  | 'CATALOG_CROSS_REFERENCE'
  | 'DONOR_ATTRIBUTES_ONLY'
  | 'UNVERIFIED';

export interface CompatibilitySignal {
  readonly confidence: CompatibilityConfidence;
  readonly evidenceSource: CompatibilityEvidenceSource;
  readonly isGuaranteed: boolean;
  readonly confidenceScore: number; // 0.0 to 1.0 numeric index
  readonly evidenceSummary: string;
  readonly userAdvice: string;
  readonly matchedOEM?: string;
  readonly donorVehicleMatchSummary?: string;
}

export interface CompatibilityEvaluationContext {
  readonly partOemReferences: readonly OEMReference[];
  readonly partDonorVehicle?: Vehicle;
  readonly targetOEMReference?: string;
  readonly targetVehicle?: VehicleTargetCriteria;
}

function modelsAreCompatible(donorModel: string, targetModel: string): boolean {
  const normDonor = normalizeVehicleModel(donorModel);
  const normTarget = normalizeVehicleModel(targetModel);
  if (normDonor === normTarget) return true;
  // Strip generation suffixes in parentheses e.g. "GOLF V (1K1)" -> "GOLF V"
  const cleanDonor = normDonor.replace(/\s*\(.*?\)/g, '').trim();
  const cleanTarget = normTarget.replace(/\s*\(.*?\)/g, '').trim();
  return (
    cleanDonor === cleanTarget ||
    normDonor.includes(normTarget) ||
    normTarget.includes(normDonor) ||
    cleanDonor.includes(cleanTarget) ||
    cleanTarget.includes(cleanDonor)
  );
}

/**
 * Pure evaluation engine for parts compatibility.
 * Strictly enforces that brand/model/year matches NEVER imply guaranteed compatibility.
 */
export function evaluateCompatibility(context: CompatibilityEvaluationContext): CompatibilitySignal {
  const { partOemReferences, partDonorVehicle, targetOEMReference, targetVehicle } = context;

  // Signal 1: OEM Reference Match
  if (targetOEMReference) {
    for (const oem of partOemReferences) {
      if (areOEMReferencesEqual(oem, targetOEMReference)) {
        // If user also specified a target vehicle, check whether it matches or conflicts with donor
        if (targetVehicle && partDonorVehicle) {
          const makeMatches =
            normalizeVehicleMake(partDonorVehicle.make) === normalizeVehicleMake(targetVehicle.make);
          const modelMatches = modelsAreCompatible(partDonorVehicle.model, targetVehicle.model);

          if (!makeMatches || !modelMatches) {
            return Object.freeze({
              confidence: 'EXACT_OEM_MATCH',
              evidenceSource: 'OEM_EXACT_REFERENCE',
              isGuaranteed: false, // Discrepancy between OEM and target vehicle
              confidenceScore: 0.8,
              evidenceSummary: `Coincide la referencia OEM (${oem.normalized}), pero el vehículo donante (${partDonorVehicle.make} ${partDonorVehicle.model}) difiere de tu vehículo (${targetVehicle.make} ${targetVehicle.model})`,
              userAdvice: 'La referencia OEM coincide con la solicitada, pero el vehículo no coincide con el donante. Comprueba exhaustivamente si tu recambio original monta esta referencia.',
              matchedOEM: oem.normalized,
            });
          }
        }

        return Object.freeze({
          confidence: 'EXACT_OEM_MATCH',
          evidenceSource: 'OEM_EXACT_REFERENCE',
          isGuaranteed: true,
          confidenceScore: 1.0,
          evidenceSummary: `Coincidencia exacta con la referencia OEM oficial: ${oem.normalized}`,
          userAdvice: 'Referencia OEM verificada. Comprueba que esta referencia figure en la pieza desmontada de tu vehículo.',
          matchedOEM: oem.normalized,
        });
      }
    }
  }

  // Signal 2: Vehicle Donor Attributes Match (Weaker signal, NEVER guaranteed)
  if (targetVehicle && partDonorVehicle) {
    const makeMatches =
      normalizeVehicleMake(partDonorVehicle.make) === normalizeVehicleMake(targetVehicle.make);
    const modelMatches = modelsAreCompatible(partDonorVehicle.model, targetVehicle.model);

    if (makeMatches && modelMatches) {
      // Check year compatibility if provided
      let yearInRange = true;
      if (targetVehicle.year !== undefined) {
        if (partDonorVehicle.yearFrom && targetVehicle.year < partDonorVehicle.yearFrom) {
          yearInRange = false;
        }
        if (partDonorVehicle.yearTo && targetVehicle.year > partDonorVehicle.yearTo) {
          yearInRange = false;
        }
      }

      if (!yearInRange) {
        return Object.freeze({
          confidence: 'UNKNOWN_PENDING_CONFIRMATION',
          evidenceSource: 'DONOR_ATTRIBUTES_ONLY',
          isGuaranteed: false,
          confidenceScore: 0.2,
          evidenceSummary: `El año del vehículo objetivo (${targetVehicle.year}) está fuera del rango del donante (${partDonorVehicle.yearFrom ?? '?'}-${partDonorVehicle.yearTo ?? '?'})`,
          userAdvice: 'El año del vehículo no coincide con el donante. Es muy probable que no sea compatible.',
        });
      }

      // Check engine code if both have it
      const engineMatches =
        targetVehicle.engineCode &&
        partDonorVehicle.engineCode &&
        targetVehicle.engineCode.trim().toUpperCase() === partDonorVehicle.engineCode.trim().toUpperCase();

      const confidenceScore = engineMatches ? 0.65 : 0.45;
      const donorDetails = [
        `${partDonorVehicle.make} ${partDonorVehicle.model}`,
        partDonorVehicle.engineCode ? `Motor: ${partDonorVehicle.engineCode}` : null,
        partDonorVehicle.yearFrom ? `Año: ${partDonorVehicle.yearFrom}` : null,
      ]
        .filter(Boolean)
        .join(', ');

      return Object.freeze({
        confidence: 'ATTRIBUTES_MATCH',
        evidenceSource: 'DONOR_ATTRIBUTES_ONLY',
        isGuaranteed: false, // NON-NEGOTIABLE: Never claim guarantee based on attributes alone
        confidenceScore,
        evidenceSummary: `Coincide vehículo donante (${donorDetails})${engineMatches ? ' con mismo código de motor' : ''}, pero falta verificación OEM`,
        userAdvice:
          'Coinciden marca y modelo del coche donante, pero la compatibilidad no está garantizada. Comprueba la referencia de tu pieza rota antes de comprar.',
        donorVehicleMatchSummary: donorDetails,
      });
    }
  }

  // Signal 3: Default Unknown / Pending confirmation
  return Object.freeze({
    confidence: 'UNKNOWN_PENDING_CONFIRMATION',
    evidenceSource: 'UNVERIFIED',
    isGuaranteed: false,
    confidenceScore: 0.0,
    evidenceSummary: 'No se dispone de referencia OEM coincidente ni datos suficientes del vehículo donante',
    userAdvice: 'Compatibilidad no confirmada. Consulta directamente al desguace aportando tu número de bastidor o referencia OEM.',
  });
}
