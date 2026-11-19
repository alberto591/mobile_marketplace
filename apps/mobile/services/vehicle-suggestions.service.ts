import type { AvailableVehicleMake } from './catalog-service.interface';

const MAKE_ALIASES: Record<string, string> = {
  vw: 'volkswagen',
  volkswaguen: 'volkswagen',
  merc: 'mercedes',
  mercedes: 'mercedes-benz',
  mb: 'mercedes-benz',
  citroen: 'citroen',
  alfa: 'alfa romeo',
  land: 'land rover',
  ssang: 'ssangyong',
};

export function normalizeSearchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function expandMakeAlias(normalizedInput: string): string {
  return MAKE_ALIASES[normalizedInput] ?? normalizedInput;
}

/**
 * Filters available catalog vehicle makes matching user input (including common abbreviations like VW).
 */
export function filterMakeSuggestions(
  vehicles: readonly AvailableVehicleMake[],
  input: string,
  limit = 6
): readonly string[] {
  if (vehicles.length === 0 || limit <= 0) return [];

  const normalized = normalizeSearchToken(input);
  if (!normalized) {
    return vehicles.slice(0, limit).map((v) => v.make);
  }

  const expanded = expandMakeAlias(normalized);
  const prefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const item of vehicles) {
    const normMake = normalizeSearchToken(item.make);
    if (normMake === normalized || normMake === expanded) {
      // Exact match already entered: keep at front only if casing/alias differs
      if (item.make.trim().toLowerCase() !== input.trim().toLowerCase()) {
        prefixMatches.unshift(item.make);
      }
      continue;
    }
    if (normMake.startsWith(expanded) || normMake.startsWith(normalized)) {
      prefixMatches.push(item.make);
    } else if (normMake.includes(expanded) || normMake.includes(normalized)) {
      substringMatches.push(item.make);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}

/**
 * Filters available catalog models for a given make.
 */
export function filterModelSuggestions(
  vehicles: readonly AvailableVehicleMake[],
  selectedMake: string,
  input: string,
  limit = 6
): readonly string[] {
  if (vehicles.length === 0 || limit <= 0) return [];

  const normMakeInput = expandMakeAlias(normalizeSearchToken(selectedMake));
  if (!normMakeInput) return [];

  const matchedMake = vehicles.find((v) => {
    const norm = normalizeSearchToken(v.make);
    return norm === normMakeInput || norm.startsWith(normMakeInput);
  });

  if (!matchedMake || matchedMake.models.length === 0) return [];

  const normModelInput = normalizeSearchToken(input);
  if (!normModelInput) {
    return matchedMake.models.slice(0, limit);
  }

  const prefixMatches: string[] = [];
  const substringMatches: string[] = [];

  for (const model of matchedMake.models) {
    const normModel = normalizeSearchToken(model);
    if (normModel === normModelInput) {
      continue;
    }
    if (normModel.startsWith(normModelInput)) {
      prefixMatches.push(model);
    } else if (normModel.includes(normModelInput)) {
      substringMatches.push(model);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}
