import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { CartHeaderButton } from '../components/CartHeaderButton';
import { CartProvider } from '../services/cart-context';
import { colors } from '../theme/index';

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <SafeAreaProvider>
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.marketplace.recambios"
      >
        <CartProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: colors.textInverse,
              headerTitleStyle: {
                fontWeight: '700',
                fontSize: 17,
              },
              headerRight: () => <CartHeaderButton />,
              contentStyle: {
                backgroundColor: colors.background,
              },
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                title: 'Buscapiezas 24h',
                headerBackTitle: 'Inicio',
              }}
            />
            <Stack.Screen
              name="results"
              options={{
                title: 'Resultados de búsqueda',
                headerBackTitle: 'Buscar',
              }}
            />
            <Stack.Screen
              name="part/[id]"
              options={{
                title: 'Ficha de pieza',
                headerBackTitle: 'Atrás',
              }}
            />
            <Stack.Screen
              name="cart"
              options={{
                title: 'Carrito de recambios',
                headerBackTitle: 'Atrás',
                headerRight: () => null,
              }}
            />
            <Stack.Screen
              name="checkout"
              options={{
                title: 'Tramitar pedido',
                headerBackTitle: 'Carrito',
                headerRight: () => null,
              }}
            />
            <Stack.Screen
              name="order/[reference]"
              options={{
                title: 'Estado del pedido',
                headerBackTitle: 'Inicio',
                headerRight: () => null,
              }}
            />
            <Stack.Screen
              name="confirm-availability"
              options={{
                title: 'Confirmar disponibilidad',
                headerBackTitle: 'Carrito',
                headerRight: () => null,
              }}
            />
          </Stack>
        </CartProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}
