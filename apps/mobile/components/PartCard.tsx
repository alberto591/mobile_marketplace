import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, getPrimaryImage, getPrimaryOEMReference } from '@mobile-marketplace/core';
import type { SearchResultItem } from '../services/catalog-service.interface';
import { useFavourites } from '../services/favourites-context';
import { sharePartNative } from '../services/share-part.service';
import { borderRadius, colors, spacing, typography } from '../theme/index';
import { CompatibilityBadge } from './CompatibilityBadge';

interface Props {
  readonly item: SearchResultItem;
}

export function PartCard({ item }: Props) {
  const { part, vendor, compatibility } = item;
  const primaryImg = getPrimaryImage(part);
  const primaryOEM = getPrimaryOEMReference(part);
  const [imageError, setImageError] = useState(false);
  const { isSaved, toggleSaved } = useFavourites();

  const conditionLabels: Record<string, string> = {
    EXCELLENT: 'Excelente estado',
    GOOD: 'Buen estado',
    FAIR: 'Estado regular',
    FOR_REPAIR: 'Para reparar / Despiece',
    UNKNOWN: 'Estado sin catalogar',
  };

  const isAvailable = part.availability.status === 'AVAILABLE';

  const handleToggleSaved = (e: any) => {
    e?.stopPropagation?.();
    toggleSaved(part.id);
  };

  const handleSharePress = async (e: any) => {
    e?.stopPropagation?.();
    await sharePartNative({
      partId: part.id,
      externalPartId: part.source.externalPartId,
      partTitle: part.title,
      priceFormatted: formatMoney(part.price),
      vendorTradeName: vendor.tradeName,
      primaryReference: primaryOEM
        ? {
            raw: primaryOEM.raw,
            isOem: primaryOEM.referenceType === 'OEM_OFFICIAL',
            referenceType: primaryOEM.referenceType,
          }
        : undefined,
    });
  };

  const handlePress = () => {
    router.push({
      pathname: '/part/[id]',
      params: { id: part.id },
    });
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Ver recambio ${part.title}, precio ${formatMoney(part.price)}`}
    >
      {/* Top Banner: Image & Quick Badges */}
      <View style={styles.imageContainer}>
        {primaryImg && !imageError ? (
          <Image
            source={{ uri: primaryImg.url }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={part.title}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>[Sin Foto]</Text>
            <Text style={styles.placeholderSub}>
              {imageError ? 'Fotografía no disponible' : 'Foto pendiente de carga'}
            </Text>
          </View>
        )}

        {/* Condition tag over image */}
        <View style={styles.floatingBadge}>
          <Text style={styles.floatingBadgeText}>
            {conditionLabels[part.condition] ?? part.condition}
          </Text>
        </View>

        {part.testedStatus === 'TESTED_WORKING' && (
          <View style={styles.testedBadge}>
            <Text style={styles.testedBadgeText}>Comprobado OK</Text>
          </View>
        )}
      </View>

      {/* Body: Details */}
      <View style={styles.content}>
        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {part.title}
        </Text>

        {/* OEM or Visual Reference */}
        {primaryOEM ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>
              {primaryOEM.referenceType === 'REFERENCIA_VISUAL' ||
              primaryOEM.brandName === 'REFERENCIA_VISUAL'
                ? 'Ref. Visual:'
                : 'OEM:'}
            </Text>
            <Text style={styles.oemText}>{primaryOEM.raw}</Text>
          </View>
        ) : (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>OEM:</Text>
            <Text style={styles.metaMissing}>No especificada</Text>
          </View>
        )}

        {/* Donor Vehicle info */}
        {part.donorVehicle && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Donante:</Text>
            <Text style={styles.vehicleText} numberOfLines={1}>
              {part.donorVehicle.make} {part.donorVehicle.model}
              {part.donorVehicle.yearFrom ? ` (${part.donorVehicle.yearFrom})` : ''}
              {part.donorVehicle.engineCode ? ` · Motor ${part.donorVehicle.engineCode}` : ''}
            </Text>
          </View>
        )}

        {/* Compatibility Badge */}
        <CompatibilityBadge signal={compatibility} />

        {/* Vendor & Actions Row */}
        <View style={styles.vendorBar}>
          <View style={styles.vendorInfo}>
            <Text style={styles.vendorName} numberOfLines={1}>
              {vendor.tradeName}
            </Text>
            <View style={styles.catRow}>
              <Text style={styles.catCode}>{vendor.catAuthorizationCode}</Text>
              <Text style={styles.locationCity}> · {vendor.location.city}</Text>
            </View>
          </View>

          <View style={styles.actionButtonsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.iconBtn,
                isSaved(part.id) && styles.savedIconBtn,
                pressed && styles.iconBtnPressed,
              ]}
              onPress={handleToggleSaved}
              accessibilityRole="button"
              accessibilityLabel={
                isSaved(part.id)
                  ? `Quitar ${part.title} de guardados`
                  : `Guardar ${part.title} en favoritos`
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isSaved(part.id) ? 'heart' : 'heart-outline'}
                size={16}
                color={isSaved(part.id) ? colors.accent : colors.textSecondary}
              />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              onPress={handleSharePress}
              accessibilityRole="button"
              accessibilityLabel={`Compartir recambio ${part.title}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Price & Checkout Note Row */}
        <View style={styles.priceFooter}>
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{formatMoney(part.price)}</Text>
            <Text style={styles.vatNote}>Impuestos y portes en checkout</Text>
          </View>
          <View style={styles.viewDetailPill}>
            <Text style={styles.viewDetailText}>Ver pieza</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.primary} />
          </View>
        </View>

        {!isAvailable && (
          <View style={styles.outOfStockAlert}>
            <Text style={styles.outOfStockText}>
              {part.availability.status === 'OUT_OF_STOCK' ? 'Agotado' : 'Disponibilidad a confirmar'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  imageContainer: {
    width: '100%',
    height: 170,
    backgroundColor: colors.cardSecondary,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardSecondary,
  },
  placeholderIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  placeholderSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  floatingBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  floatingBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
  },
  testedBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.verified,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  testedBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: spacing.md,
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 60,
  },
  oemText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  metaMissing: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  vehicleText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  vendorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  vendorInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  vendorName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
  },
  catCode: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
  },
  locationCity: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
  },
  savedIconBtn: {
    backgroundColor: 'rgba(202, 2, 2, 0.08)',
    borderColor: colors.accent,
  },
  priceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceBlock: {
    flex: 1,
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
  },
  vatNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  viewDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 2,
  },
  viewDetailText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  outOfStockAlert: {
    marginTop: spacing.sm,
    backgroundColor: colors.dangerBg,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  outOfStockText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
});
