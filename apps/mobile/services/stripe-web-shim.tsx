import React from 'react';

export interface StripeProviderProps {
  children?: React.ReactNode;
  publishableKey?: string;
  merchantIdentifier?: string;
  [key: string]: unknown;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ children }) => {
  return <>{children}</>;
};

export const initStripe = async (_options?: unknown): Promise<void> => {
  return Promise.resolve();
};

export const useStripe = () => {
  return {
    initPaymentSheet: async (_params?: unknown) => {
      return { error: undefined };
    },
    presentPaymentSheet: async () => {
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
