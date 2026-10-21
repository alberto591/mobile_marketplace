import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, getPrimaryImage, getPrimaryOEMReference } from '@mobile-marketplace/core';
import { CompatibilityBadge } from '../components/CompatibilityBadge';
import { EmptyState } from '../components/EmptyState';
import { catalogService } from '../services/catalog-service.factory';
import type { PartDetailResult } from '../services/catalog-service.interface';
import { useFavourites } from '../services/favourites-context';
import { borderRadius, colors, spacing, typography } from '../theme/index';

interface ResolvedSavedItem {
  readonly id: string;
  readonly status: 'found' | 'missing' | 'error';
  readonly data?: PartDetailResult;
  readonly errorMsg?: string;
}

export default function SavedPartsScreen() {
  const { savedPartIds, removeSaved, isLoaded } = useFavourites();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<readonly ResolvedSavedItem[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadSavedParts() {
      if (!isLoaded) return;
      if (savedPartIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const promises = savedPartIds.map(async (partId): Promise<ResolvedSavedItem> => {
        try {
          const res = await catalogService.getPartById(partId);
          if (res && res.part) {
            return { id: partId, status: 'found', data: res };
          }
          return { id: partId, status: 'missing' };
        } catch (err: any) {
          return {
            id: partId,
            status: 'error',
            errorMsg: err?.message || 'Error al consultar catálogo',
          };
        }
      });

      const results = await Promise.all(promises);
      if (isMounted) {
        setItems(results);
        setLoading(false);
      }
    }

    loadSavedParts();

    return () => {
      isMounted = false;
    };
  }, [savedPartIds, isLoaded]);

  if (loading || !isLoaded) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Cargando tus piezas guardadas...</Text>
      </View>
    );
  }

  if (savedPartIds.length === 0) {
    return (
      <View style={styles.screen}>
        <EmptyState
          title="No tienes piezas guardadas"
          message="Pulsa el icono de corazón en cualquier recambio para guardarlo en este dispositivo y revisarlo cuando lo necesites, sin crear cuenta."
          actionLabel="Explorar catálogo"
          onAction={() => router.push('/')}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>Tus piezas guardadas</Text>
        <Text style={styles.headerSubtitle}>
          {savedPartIds.length} {savedPartIds.length === 1 ? 'recambio guardado' : 'recambios guardados'} en este dispositivo.
        </Text>
      </View>

      {items.map((item) => {
        if (item.status === 'missing' || item.status === 'error') {
          return (
            <View key={item.id} style={styles.missingCard}>
              <View style={styles.missingHeader}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
                <Text style={styles.missingTitle}>Recambio no disponible</Text>
              </View>
              <Text style={styles.missingText}>
                Esta pieza (ID: {item.id.substring(0, 10)}) ha sido vendida o ya no figura en el inventario activo del desguace.
              </Text>
              <Pressable
                style={styles.removeBtn}
                onPress={() => removeSaved(item.id)}
                accessibilityRole="button"
                accessibilityLabel="Quitar recambio no disponible de guardados"
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.removeBtnText}>Quitar de guardados</Text>
              </Pressable>
            </View>
          );
        }

        if (!item.data) return null;
        const { part, vendor, compatibility } = item.data;
        const primaryImg = getPrimaryImage(part);
        const primaryOEM = getPrimaryOEMReference(part);
        const isAvailable = part.availability.status === 'AVAILABLE';

        return (
          <View key={part.id} style={styles.card}>
            <Pressable
              style={styles.cardBody}
              onPress={() => router.push({ pathname: '/part/[id]', params: { id: part.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Ver ficha de ${part.title}`}
            >
              <View style={styles.imageRow}>
                {primaryImg ? (
                  <Image source={{ uri: primaryImg.url }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Text style={styles.thumbPlaceholderText}>[Sin foto]</Text>
                  </View>
                )}

                <View style={styles.infoCol}>
                  <Text style={styles.partTitle} numberOfLines={2}>
                    {part.title}
                  </Text>
                  <Text style={styles.partPrice}>{formatMoney(part.price)}</Text>
                  <Text style={styles.vendorText} numberOfLines={1}>
                    {vendor.tradeName} · {vendor.location.city}
                  </Text>

                  {primaryOEM && (
                    <Text style={styles.refText} numberOfLines={1}>
                      {primaryOEM.referenceType === 'REFERENCIA_VISUAL'
                        ? `Ref. visual: ${primaryOEM.raw}`
                        : `OEM: ${primaryOEM.raw}`}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.badgeRow}>
                <CompatibilityBadge signal={compatibility} />
                {!isAvailable && (
                  <View style={styles.unavailablePill}>
                    <Text style={styles.unavailablePillText}>Agotado</Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View style={styles.cardActions}>
              <Pressable
                style={styles.viewDetailsBtn}
                onPress={() => router.push({ pathname: '/part/[id]', params: { id: part.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Ver detalles de ${part.title}`}
              >
                <Text style={styles.viewDetailsText}>Ver detalles</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </Pressable>

              <Pressable
                style={styles.removeBtn}
                onPress={() => removeSaved(part.id)}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${part.title} de guardados`}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={styles.removeBtnText}>Quitar</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 14,
  },
  headerBox: {
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardBody: {
    padding: spacing.md,
  },
  imageRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  thumbImage: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardSecondary,
  },
  thumbPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  infoCol: {
    flex: 1,
  },
  partTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  partPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  vendorText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  refText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  badgeRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unavailablePill: {
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  unavailablePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardSecondary,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  missingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  missingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  missingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warning,
  },
  missingText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
});
