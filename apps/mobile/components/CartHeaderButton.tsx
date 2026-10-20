import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart } from '../services/cart-context';
import { borderRadius, colors, spacing } from '../theme/index';

export function CartHeaderButton() {
  const { itemCount } = useCart();

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={() => router.push('/cart')}
      accessibilityRole="button"
      accessibilityLabel={`Carrito de compra, ${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'}`}
    >
      <Text style={styles.cartText}>Carrito</Text>
      {itemCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{itemCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginRight: spacing.xs,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  cartText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 13,
  },
  badge: {
    marginLeft: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '800',
  },
});
