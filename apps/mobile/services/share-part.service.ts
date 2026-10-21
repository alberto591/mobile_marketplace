import { Share } from 'react-native';

export interface SharePartPayloadOptions {
  readonly partId: string;
  readonly externalPartId?: string;
  readonly partTitle: string;
  readonly priceFormatted: string;
  readonly vendorTradeName: string;
  readonly primaryReference?: {
    readonly raw: string;
    readonly isOem: boolean;
    readonly referenceType?: string;
  };
  readonly webBaseUrl?: string;
}

export interface ShareMessageResult {
  readonly title: string;
  readonly message: string;
  readonly url?: string;
}

/**
 * Builds an honest, informative text payload for sharing a part with
 * mechanics, customers, or workshop managers.
 */
export function buildSharePartMessage(options: SharePartPayloadOptions): ShareMessageResult {
  const listingCode = options.externalPartId || options.partId.substring(0, 8);

  let refClause = '';
  if (options.primaryReference?.raw) {
    const isVerifiedOem =
      options.primaryReference.isOem &&
      options.primaryReference.referenceType === 'OEM_OFFICIAL';

    if (isVerifiedOem) {
      refClause = `\n• Referencia OEM: ${options.primaryReference.raw}`;
    } else {
      // Honestly distinguish visual or internal inventory reference
      refClause = `\n• Código de inventario CAT: ${options.primaryReference.raw} (lectura visual)`;
    }
  }

  // Generate verified web URL or honest app scheme
  const deepLink = `recambios://part/${options.partId}`;
  let linkSection = `\nVer en la app BuscaPiezas 24H: ${deepLink}`;

  if (options.webBaseUrl && options.webBaseUrl.startsWith('http')) {
    const cleanBase = options.webBaseUrl.replace(/\/+$/, '');
    linkSection = `\nEnlace: ${cleanBase}/part/${options.partId}\nApp: ${deepLink}`;
  }

  const message =
    `BuscaPiezas 24H — Ficha de Recambio\n` +
    `----------------------------------------\n` +
    `• Pieza: ${options.partTitle}\n` +
    `• Precio: ${options.priceFormatted} (Garantía legal CAT)\n` +
    `• Desguace: ${options.vendorTradeName}${refClause}\n` +
    `• Ref. localizador: ${listingCode}\n` +
    `----------------------------------------` +
    linkSection;

  return {
    title: `Recambio: ${options.partTitle} (${options.priceFormatted})`,
    message,
    url: options.webBaseUrl ? `${options.webBaseUrl.replace(/\/+$/, '')}/part/${options.partId}` : undefined,
  };
}

export interface NativeShareHandler {
  share(
    content: { title?: string; message: string; url?: string },
    options?: Record<string, unknown>
  ): Promise<{ action: 'sharedAction' | 'dismissedAction'; activityType?: string | null }>;
}

/**
 * Triggers the device's native share sheet.
 * Uses static Share import without evaluating dynamic legacy modules in Expo Go.
 * Handles user dismissal safely without throwing or mutating app state.
 */
export async function sharePartNative(
  options: SharePartPayloadOptions,
  shareHandler?: NativeShareHandler
): Promise<'shared' | 'dismissed' | 'failed'> {
  const payload = buildSharePartMessage(options);

  try {
    const handler = shareHandler ?? Share;

    if (!handler || typeof handler.share !== 'function') {
      return 'failed';
    }

    const res = await handler.share(
      {
        title: payload.title,
        message: payload.message,
        url: payload.url,
      },
      {
        dialogTitle: 'Compartir recambio con mi mecánico o cliente',
      }
    );

    if (res.action === 'dismissedAction') {
      return 'dismissed';
    }

    return 'shared';
  } catch {
    return 'failed';
  }
}
