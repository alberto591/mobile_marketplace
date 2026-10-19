import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme/index';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
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
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Recambios de Desguace',
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
      </Stack>
    </SafeAreaProvider>
  );
}
