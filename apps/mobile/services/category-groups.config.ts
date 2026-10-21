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
