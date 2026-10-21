import React from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export interface StripeProviderProps {
  children?: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  [key: string]: unknown;
}

// Determina si estamos en Expo Go (donde @stripe/stripe-react-native no está compilado en la IPA de App Store)
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as Record<string, unknown>).appOwnership === 'expo';

// Carga segura del módulo nativo únicamente cuando NO estamos en web ni en Expo Go
let RealStripe: Record<string, unknown> | null = null;
if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    RealStripe = require('@stripe/stripe-react-native');
  } catch {
    RealStripe = null;
  }
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ children, ...props }) => {
  if (RealStripe && typeof RealStripe.StripeProvider === 'function') {
    const Component = RealStripe.StripeProvider as React.ComponentType<Record<string, unknown>>;
    return <Component {...props}>{children}</Component>;
  }
  return <>{children}</>;
};

export const initStripe = async (options?: unknown): Promise<void> => {
  if (RealStripe && typeof RealStripe.initStripe === 'function') {
    return (RealStripe.initStripe as (opts?: unknown) => Promise<void>)(options);
  }
  return Promise.resolve();
};

export const useStripe = () => {
  if (RealStripe && typeof RealStripe.useStripe === 'function') {
    return (RealStripe.useStripe as () => {
      initPaymentSheet: (params?: unknown) => Promise<{ error?: { code: string; message: string } }>;
      presentPaymentSheet: () => Promise<{ error?: { code: string; message: string } }>;
    })();
  }

  return {
    initPaymentSheet: async (_params?: unknown) => {
      return { error: undefined };
    },
    presentPaymentSheet: async () => {
      if (isExpoGo) {
        return {
          error: {
            code: 'ExpoGoRestricted',
            message:
              'Stripe Payment Sheet requiere un build de desarrollo nativo y no está incluido en Expo Go estándar. El resto del flujo de la app está 100% operativo.',
          },
        };
      }
      return {
        error: {
          code: 'Failed',
          message: 'El pago nativo con Stripe Sheet solo está disponible en dispositivos móviles iOS y Android.',
        },
      };
    },
  };
};

export default {
  StripeProvider,
  initStripe,
  useStripe,
};
