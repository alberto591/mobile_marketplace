import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../services/cart-context';
import { useFavourites } from '../services/favourites-context';
import { borderRadius, colors, spacing } from '../theme/index';

interface Props {
  readonly hideSaved?: boolean;
  readonly hideCart?: boolean;
}

export function HeaderNavActions({ hideSaved = false, hideCart = false }: Props) {
  const { itemCount } = useCart();
  const { savedCount } = useFavourites();

  return (
    <View style={styles.container}>
      {!hideSaved && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push('/saved')}
          accessibilityRole="button"
          accessibilityLabel={`Piezas guardadas, ${savedCount} ${savedCount === 1 ? 'recambio' : 'recambios'}`}
        >
          <Ionicons
            name={savedCount > 0 ? 'heart' : 'heart-outline'}
            size={16}
            color={savedCount > 0 ? colors.accent : colors.textInverse}
            style={styles.icon}
          />
          <Text style={styles.buttonText}>Guardados</Text>
          {savedCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{savedCount}</Text>
            </View>
          )}
        </Pressable>
      )}

      {!hideCart && (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => router.push('/cart')}
          accessibilityRole="button"
          accessibilityLabel={`Carrito de compra, ${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'}`}
        >
          <Ionicons name="cart-outline" size={16} color={colors.textInverse} style={styles.icon} />
          <Text style={styles.buttonText}>Carrito</Text>
          {itemCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{itemCount}</Text>
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.xs,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  icon: {
    marginRight: 4,
  },
  buttonText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 12,
  },
  badge: {
    marginLeft: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
});
