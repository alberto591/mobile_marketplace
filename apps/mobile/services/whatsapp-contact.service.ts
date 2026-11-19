import { Linking } from 'react-native';

export interface WhatsAppMessageOptions {
  readonly partTitle: string;
  readonly priceFormatted: string;
  readonly listingId: string;
  readonly vendorTradeName?: string;
  readonly primaryReference?: {
    readonly raw: string;
    readonly isOem: boolean;
    readonly referenceType?: string;
  };
  readonly destinationProvince?: string;
}

/**
 * Normalizes an international telephone number for WhatsApp wa.me links.
 * Strips whitespace, hyphens, and brackets.
 * Adds Spanish country code '34' if a 9-digit Spanish number is supplied.
 * Returns null if the number is missing or cannot be validated.
 */
export function normalizePhoneNumberForWhatsApp(rawPhone?: string | null): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return null;
  }

  // Remove whitespace, dashes, parentheses
  let cleaned = rawPhone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Only digits allowed
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  // 9-digit Spanish number (e.g. 952000000 or 612345678)
  if (cleaned.length === 9 && /^[6789]\d{8}$/.test(cleaned)) {
    return `34${cleaned}`;
  }

  // Spanish number already prefixed with 34 (11 digits)
  if (cleaned.length === 11 && cleaned.startsWith('34')) {
    return cleaned;
  }

  // Generic international number: must be at least 10 digits
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }

  return null;
}

/**
 * Generates honest Spanish inquiry copy for scrapyard seller.
 * Crucial rule: Never label a visual or catalogue reference as OEM.
 */
export function buildWhatsAppInquiryMessage(options: WhatsAppMessageOptions): string {
  const greeting = options.vendorTradeName
    ? `Hola ${options.vendorTradeName}`
    : 'Hola';

  let refText = '';
  if (options.primaryReference?.raw) {
    const isVerifiedOem =
      options.primaryReference.isOem &&
      options.primaryReference.referenceType === 'OEM_OFFICIAL';

    if (isVerifiedOem) {
      refText = `, ref. OEM ${options.primaryReference.raw}`;
    } else {
      // Honestly distinguish visual or internal inventory reference
      refText = `, código de inventario ${options.primaryReference.raw}`;
    }
  }

  const provinceClause = options.destinationProvince
    ? ` y si realizáis envíos a ${options.destinationProvince}`
    : '';

  return `${greeting}, he visto en BuscaPiezas 24H el recambio "${options.partTitle}"${refText} (código ${options.listingId}) por ${options.priceFormatted}. ¿Podéis confirmar si sigue disponible en estantería${provinceClause}? Muchas gracias.`;
}

/**
 * Builds the wa.me deep link with prefilled, properly URL-encoded text.
 */
export function buildWhatsAppUrl(
  rawPhone: string | null | undefined,
  message: string
): string | null {
  const normalizedPhone = normalizePhoneNumberForWhatsApp(rawPhone);
  if (!normalizedPhone) {
    return null;
  }

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;
}

export interface UrlOpener {
  canOpenURL?(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

export interface OpenWhatsAppOptions extends WhatsAppMessageOptions {
  readonly publicPhone?: string | null;
  readonly onUnavailable?: (phone: string | null) => void;
  readonly urlOpener?: UrlOpener;
}

/**
 * Initiates the native WhatsApp opening workflow.
 * Uses static Linking import without evaluating dynamic legacy modules in Expo Go.
 * Customer retains full control to review, edit, or cancel the message before sending.
 */
export async function openWhatsAppContact(options: OpenWhatsAppOptions): Promise<boolean> {
  const message = buildWhatsAppInquiryMessage(options);
  const normalizedPhone = normalizePhoneNumberForWhatsApp(options.publicPhone);

  if (!normalizedPhone) {
    if (options.onUnavailable) {
      options.onUnavailable(options.publicPhone ?? null);
    }
    return false;
  }

  const encodedMessage = encodeURIComponent(message);
  const nativeUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedMessage}`;
  const webUrl = `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;

  try {
    const opener = options.urlOpener ?? Linking;

    if (!opener || typeof opener.openURL !== 'function') {
      options.onUnavailable?.(options.publicPhone ?? null);
      return false;
    }

    const canOpenNative = opener.canOpenURL
      ? await opener.canOpenURL(nativeUrl).catch(() => false)
      : false;

    if (canOpenNative) {
      await opener.openURL(nativeUrl);
      return true;
    }

    await opener.openURL(webUrl);
    return true;
  } catch {
    if (options.onUnavailable) {
      options.onUnavailable(options.publicPhone ?? null);
    }
    return false;
  }
}

export interface MissingPartWhatsAppOptions {
  readonly query?: string;
  readonly oemReference?: string;
  readonly categoryLabel?: string;
  readonly vehicleMake?: string;
  readonly vehicleModel?: string;
  readonly vehicleYear?: number;
  readonly vendorTradeName?: string;
  readonly publicPhone?: string | null;
  readonly onUnavailable?: (phone: string | null) => void;
  readonly urlOpener?: UrlOpener;
}

/**
 * Generates honest Spanish lead-capture copy when a catalog search returns 0 results.
 */
export function buildMissingPartWhatsAppMessage(
  options: Omit<MissingPartWhatsAppOptions, 'publicPhone' | 'onUnavailable' | 'urlOpener'>
): string {
  const greeting = options.vendorTradeName ? `Hola ${options.vendorTradeName}` : 'Hola';

  const partTerms: string[] = [];
  if (options.query?.trim()) {
    partTerms.push(`"${options.query.trim()}"`);
  } else if (options.categoryLabel?.trim()) {
    partTerms.push(`recambio de ${options.categoryLabel.trim()}`);
  }
  if (options.oemReference?.trim()) {
    partTerms.push(`ref. OEM ${options.oemReference.trim()}`);
  }

  const partPhrase =
    partTerms.length > 0 ? partTerms.join(' · ') : 'un recambio de segunda mano';

  const vehicleParts = [
    options.vehicleMake?.trim(),
    options.vehicleModel?.trim(),
    options.vehicleYear ? `(${options.vehicleYear})` : undefined,
  ].filter(Boolean);

  const vehicleClause = vehicleParts.length > 0 ? ` para ${vehicleParts.join(' ')}` : '';

  return `${greeting}, he buscado en BuscaPiezas 24H ${partPhrase}${vehicleClause} y no aparecía en el catálogo online. ¿Podéis comprobar si lo tenéis disponible o en despiece y darme presupuesto? Muchas gracias.`;
}

/**
 * Opens WhatsApp prefilled with the user's 0-result search criteria so the CAT can quote it.
 */
export async function openMissingPartWhatsApp(
  options: MissingPartWhatsAppOptions
): Promise<boolean> {
  const normalizedPhone = normalizePhoneNumberForWhatsApp(options.publicPhone);
  if (!normalizedPhone) {
    options.onUnavailable?.(options.publicPhone ?? null);
    return false;
  }

  const message = buildMissingPartWhatsAppMessage(options);
  const encodedMessage = encodeURIComponent(message);
  const nativeUrl = `whatsapp://send?phone=${normalizedPhone}&text=${encodedMessage}`;
  const webUrl = `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;

  try {
    const opener = options.urlOpener ?? Linking;
    if (!opener || typeof opener.openURL !== 'function') {
      options.onUnavailable?.(options.publicPhone ?? null);
      return false;
    }

    const canOpenNative = opener.canOpenURL
      ? await opener.canOpenURL(nativeUrl).catch(() => false)
      : false;

    if (canOpenNative) {
      await opener.openURL(nativeUrl);
      return true;
    }

    await opener.openURL(webUrl);
    return true;
  } catch {
    options.onUnavailable?.(options.publicPhone ?? null);
    return false;
  }
}
