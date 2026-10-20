import { router } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney, getPrimaryImage, getPrimaryOEMReference } from '@mobile-marketplace/core';
import type { SearchResultItem } from '../services/catalog-service.interface';
import { borderRadius, colors, spacing, typography } from '../theme/index';
import { CompatibilityBadge } from './CompatibilityBadge';

interface Props {
  readonly item: SearchResultItem;
}

export function PartCard({ item }: Props) {
  const { part, vendor, compatibility } = item;
  const primaryImg = getPrimaryImage(part);
  const primaryOEM = getPrimaryOEMReference(part);

  const conditionLabels: Record<string, string> = {
    EXCELLENT: 'Excelente estado',
    GOOD: 'Buen estado',
    FAIR: 'Estado regular',
    FOR_REPAIR: 'Para reparar / Despiece',
    UNKNOWN: 'Estado sin catalogar',
  };

  const isAvailable = part.availability.status === 'AVAILABLE';

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
        {primaryImg ? (
          <Image
            source={{ uri: primaryImg.url }}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={part.title}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.placeholderIcon}>[Sin Foto]</Text>
            <Text style={styles.placeholderSub}>Foto pendiente de carga</Text>
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

        {/* Footer: Price, Seller & Availability */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.price}>{formatMoney(part.price)}</Text>
            <Text style={styles.vatNote}>IVA incluido</Text>
          </View>

          <View style={styles.vendorInfo}>
            <Text style={styles.vendorName} numberOfLines={1}>
              {vendor.tradeName}
            </Text>
            <View style={styles.catRow}>
              <Text style={styles.catCode}>{vendor.catAuthorizationCode}</Text>
              <Text style={styles.locationCity}> · {vendor.location.city}</Text>
            </View>
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  price: {
    ...typography.price,
    color: colors.textPrimary,
  },
  vatNote: {
    fontSize: 11,
    color: colors.textMuted,
  },
  vendorInfo: {
    alignItems: 'flex-end',
    maxWidth: '55%',
  },
  vendorName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
