/**
 * Theme & Design System for Buscapiezas 24h (Recambios de Desguace).
 * Tailored for clarity, high contrast, automotive trust, and one-handed mobile ergonomics.
 */

export const colors = {
  // Brand & Accent (Buscapiezas 24h: Racing Red & Midnight Obsidian)
  primary: '#0B0C0F',      // Deep Obsidian Midnight (website --bg)
  primaryLight: '#14161C', // Elevated Dark Surface (website --bg3)
  accent: '#CA0202',       // Signature Racing Red (website --acc / --rojo)
  accentHover: '#E31B1B',  // Vivid Red (website --acc2)
  accentSubtle: '#FDF2F2', // Soft red tint for badges and highlights

  // Direct Communication (WhatsApp)
  whatsapp: '#25D366',     // WhatsApp Green (website --wa)

  // Status & Badges
  verified: '#059669',     // Emerald (Verified OEM / Guaranteed)
  verifiedBg: '#ECFDF5',
  verifiedBorder: '#A7F3D0',

  warning: '#D97706',      // Amber (Attributes only / Unverified match)
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',

  neutralStatus: '#475569',// Slate (Pending confirmation)
  neutralBg: '#F1F5F9',
  neutralBorder: '#CBD5E1',

  danger: '#CA0202',       // Red (Out of stock / Sold / Error)
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',

  // Surfaces & Backgrounds
  background: '#F8FAFC',
  card: '#FFFFFF',
  cardSecondary: '#F1F5F9',
  border: '#E3E2DE',       // Refined border matching website --line
  borderStrong: '#CBD5E1',

  // Text
  textPrimary: '#0B0C0F',   // Pure dark ink (website --bg)
  textSecondary: '#525866', // Balanced neutral text
  textMuted: '#8B93A1',     // Muted labels (website --mut)
  textInverse: '#FFFFFF',   // High-contrast white on dark surfaces (website --tx)
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
};

export const typography = {
  titleLarge: {
    fontSize: 22,
    fontWeight: '700' as const,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  titleMedium: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  titleSmall: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  bodySecondary: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  price: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
};
