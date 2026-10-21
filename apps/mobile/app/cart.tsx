import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatMoney, getPrimaryImage, getPrimaryOEMReference } from '@mobile-marketplace/core';
import { EmptyState } from '../components/EmptyState';
import { useCart } from '../services/cart-context';
import type { CartItem } from '../services/cart.service';
import { borderRadius, colors, spacing, typography } from '../theme/index';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { items, itemCount, subtotal, vendorGroups, removeItem, clearCart } = useCart();
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleClearCart = () => {
    Alert.alert(
      'Vaciar carrito',
      '¿Deseas eliminar todas las piezas de tu selección actual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: () => clearCart(),
        },
      ]
    );
  };

  const handleRemoveItem = (item: CartItem) => {
    removeItem(item.part.id);
  };

  if (itemCount === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.emptyContainer}>
          <EmptyState
            title="Tu carrito está vacío"
            message="Aún no has añadido recambios a tu selección. Explora el catálogo de desguaces para localizar las piezas que necesitas para tu vehículo."
            actionLabel="Buscar recambios"
            onAction={() => router.replace('/')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 110 }]}>
        {/* Info Banner */}
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeTitle}>Marketplace transaccional de desguaces</Text>
          <Text style={styles.noticeText}>
            Cada Centro Autorizado de Tratamiento (CAT) es el vendedor legal de sus piezas y se encarga del empaquetado y envío directo a tu dirección.
          </Text>
        </View>

        {/* Multi-Vendor Cart Advisory */}
        {vendorGroups.length > 1 && (
          <View style={styles.multiVendorBanner}>
            <Text style={styles.multiVendorTitle}>Aviso: Piezas de múltiples desguaces</Text>
            <Text style={styles.multiVendorText}>
              Para este primer lanzamiento, cada pedido tramita las piezas de un único desguace. En el checkout tramitarás primero las del vendedor principal y las restantes permanecerán en tu carrito.
            </Text>
          </View>
        )}

        {/* Grouped Items by Scrap Yard */}
        {vendorGroups.map((group) => (
          <View key={group.vendorId} style={styles.vendorCard}>
            {/* Vendor Header */}
            <View style={styles.vendorHeader}>
              <View style={styles.vendorBadge}>
                <Text style={styles.vendorBadgeText}>CAT Autorizado</Text>
              </View>
              <Text style={styles.vendorName}>{group.vendor.tradeName}</Text>
              <Text style={styles.vendorLocation}>
                {group.vendor.catAuthorizationCode} · {group.vendor.location.city} ({group.vendor.location.province})
              </Text>
            </View>

            {/* Pieces for this vendor */}
            <View style={styles.itemsList}>
              {group.items.map((item) => {
                const primaryImg = getPrimaryImage(item.part);
                const primaryOEM = getPrimaryOEMReference(item.part);
                const isImageFailed = primaryImg ? failedImages.has(primaryImg.id) : true;

                return (
                  <View key={item.part.id} style={styles.itemRow}>
                    {/* Item Image */}
                    <Pressable
                      style={styles.thumbContainer}
                      onPress={() =>
                        router.push({
                          pathname: '/part/[id]',
                          params: { id: item.part.id },
                        })
                      }
                      accessibilityLabel={`Ver ficha de ${item.part.title}`}
                    >
                      {primaryImg && !isImageFailed ? (
                        <Image
                          source={{ uri: primaryImg.url }}
                          style={styles.thumbImage}
                          resizeMode="cover"
                          onError={() => {
                            setFailedImages((prev) => new Set(prev).add(primaryImg.id));
                          }}
                        />
                      ) : (
                        <View style={styles.thumbPlaceholder}>
                          <Text style={styles.thumbPlaceholderText}>[Foto]</Text>
                        </View>
                      )}
                    </Pressable>

                    {/* Item Details */}
                    <View style={styles.itemInfo}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/part/[id]',
                            params: { id: item.part.id },
                          })
                        }
                      >
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {item.part.title}
                        </Text>
                      </Pressable>

                      {primaryOEM && (
                        <Text style={styles.itemOem}>
                          OEM: {primaryOEM.raw}
                        </Text>
                      )}

                      <View style={styles.itemQuantityBadge}>
                        <Text style={styles.itemQuantityText}>
                          1 unidad única (Oferta física del CAT)
                        </Text>
                      </View>

                      <View style={styles.itemPriceBlock}>
                        <Text style={styles.itemPrice}>
                          {formatMoney(item.part.price)}
                        </Text>
                        <Text style={styles.itemVat}>Impuestos y portes en checkout</Text>
                      </View>
                    </View>

                    {/* Remove Action */}
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => handleRemoveItem(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Eliminar ${item.part.title} del carrito`}
                    >
                      <Text style={styles.removeBtnText}>Eliminar</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Vendor Subtotal */}
            <View style={styles.vendorFooter}>
              <Text style={styles.vendorSubtotalLabel}>
                Subtotal piezas {group.vendor.tradeName}:
              </Text>
              <Text style={styles.vendorSubtotalValue}>
                {formatMoney(group.subtotal)}
              </Text>
            </View>
            <Text style={styles.shippingNotice}>
              Precio publicado por el desguace. Impuestos aplicables y gastos de transporte por confirmar con {group.vendor.tradeName}.
            </Text>
          </View>
        ))}

        {/* Clear Cart Button */}
        <Pressable style={styles.clearBtn} onPress={handleClearCart}>
          <Text style={styles.clearBtnText}>Vaciar todo el carrito</Text>
        </Pressable>
      </ScrollView>

      {/* Floating Checkout Bar with Safe Area Support */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + spacing.xs }]}>
        <View style={styles.bottomMainRow}>
          <View style={styles.priceContainer}>
            <Text style={styles.totalCountLabel}>
              {itemCount} {itemCount === 1 ? 'pieza seleccionada' : 'piezas seleccionadas'}
            </Text>
            <Text style={styles.subtotalValue}>{formatMoney(subtotal)}</Text>
          </View>

          <Pressable
            style={styles.continueBtn}
            onPress={() => router.push('/checkout')}
            accessibilityRole="button"
            accessibilityLabel="Continuar hacia tramitación y pago del pedido"
          >
            <Text style={styles.continueBtnText}>Tramitar pedido</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.textInverse} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>

        <Text style={styles.subtotalHint}>
          Precio de catálogo · Gastos de envío e impuestos en el checkout
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 130, // Clearance for floating bottom bar
  },
  emptyContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  noticeBanner: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  vendorCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  vendorHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  vendorBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  vendorBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
  },
  vendorName: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  vendorLocation: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  itemsList: {
    gap: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-start',
  },
  thumbContainer: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.cardSecondary,
    marginRight: spacing.sm,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  itemInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  itemOem: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  itemQuantityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.cardSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  itemQuantityText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  itemPriceBlock: {
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.accent,
  },
  itemVat: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  removeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  removeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  vendorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  vendorSubtotalLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  vendorSubtotalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  shippingNotice: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  clearBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  priceContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  totalCountLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  subtotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.accent,
  },
  subtotalHint: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  continueBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  multiVendorBanner: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  multiVendorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  multiVendorText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
