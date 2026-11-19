import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '../services/stripe-client';
import { HeaderNavActions } from '../components/HeaderNavActions';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { CartProvider } from '../services/cart-context';
import { FavouritesProvider } from '../services/favourites-context';
import { GarageProvider } from '../services/garage-context';
import { colors } from '../theme/index';

export default function RootLayout() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.marketplace.recambios"
      >
        <CartProvider>
          <FavouritesProvider>
            <GarageProvider>
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
                headerRight: () => <HeaderNavActions />,
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
              name="saved"
              options={{
                title: 'Piezas guardadas',
                headerBackTitle: 'Atrás',
                headerRight: () => <HeaderNavActions hideSaved />,
              }}
            />
            <Stack.Screen
              name="orders"
              options={{
                title: 'Mis pedidos',
                headerBackTitle: 'Atrás',
                headerRight: () => <HeaderNavActions hideOrders />,
              }}
            />
            <Stack.Screen
              name="vendor/order"
              options={{
                title: 'Pedido para enviar',
                // Seller page: opened from an email link, outside the shopping flow.
                headerBackVisible: false,
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
        </GarageProvider>
      </FavouritesProvider>
    </CartProvider>
    </StripeProvider>
      </AppErrorBoundary>
  </SafeAreaProvider>
);
}
