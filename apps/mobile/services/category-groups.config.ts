export interface CanonicalCategoryGroupDef {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly iconName: string;
  readonly categoryIds: readonly string[];
}

export const CANONICAL_CATEGORY_GROUPS: readonly CanonicalCategoryGroupDef[] = [
  {
    id: 'frenos-suspension',
    label: 'Frenos y suspensión',
    subtitle: 'Pinzas, servofreno, bombas, ABS',
    iconName: 'car-sport-outline',
    categoryIds: ['SUSPENSIÓN / FRENOS'],
  },
  {
    id: 'mecanica-motor',
    label: 'Mecánica y motor',
    subtitle: 'Intercoolers, cambios, embragues',
    iconName: 'hardware-chip-outline',
    categoryIds: ['MOTOR / ADMISIÓN / ESCAPE', 'CAMBIO / EMBRAGUE', 'DIRECCIÓN / TRANSMISIÓN'],
  },
  {
    id: 'electricidad-iluminacion',
    label: 'Electricidad y alumbrado',
    subtitle: 'Centralitas, cuadros, mandos, relés',
    iconName: 'flash-outline',
    categoryIds: ['ELECTRICIDAD', 'ALUMBRADO'],
  },
  {
    id: 'climatizacion-confort',
    label: 'Climatización y calefacción',
    subtitle: 'Compresores A/C, radiadores, mandos',
    iconName: 'snow-outline',
    categoryIds: ['CLIMATIZACIÓN'],
  },
  {
    id: 'carroceria-exteriores',
    label: 'Carrocería y exteriores',
    subtitle: 'Manetas, aletas, capós, cerraduras',
    iconName: 'construct-outline',
    categoryIds: ['CARROCERÍA FRONTAL', 'CARROCERÍA LATERALES'],
  },
] as const;

function safeDecodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves canonical DB category IDs from Expo Router params.
 * Prefers the ASCII `categoryGroupId` slug so names containing `/` (e.g. "SUSPENSIÓN / FRENOS")
 * are never corrupted by URL `%2F` encoding/decoding across native and web routers.
 */
export function resolveCategoryIdsFromRouteParams(params: {
  readonly categoryGroupId?: string;
  readonly categoryIds?: string;
}): readonly string[] | undefined {
  if (params.categoryGroupId) {
    const group = CANONICAL_CATEGORY_GROUPS.find((g) => g.id === params.categoryGroupId);
    if (group) {
      return group.categoryIds;
    }
  }
  if (!params.categoryIds) {
    return undefined;
  }
  const decoded = params.categoryIds
    .split(',')
    .map((item) => safeDecodeParam(item).trim())
    .filter((item) => item.length > 0);
  return decoded.length > 0 ? decoded : undefined;
}
