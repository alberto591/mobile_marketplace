import { router, useLocalSearchParams } from 'expo-router';
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
import { formatMoney } from '@mobile-marketplace/core';
import { CompatibilityBadge } from '../../components/CompatibilityBadge';
import { EmptyState } from '../../components/EmptyState';
import { InquiryModal } from '../../components/InquiryModal';
import type { PartDetailResult } from '../../services/catalog-service.interface';
import { catalogService } from '../../services/catalog-service.factory';
import { borderRadius, colors, spacing, typography } from '../../theme/index';

export default function PartDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PartDetailResult | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPart() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.getPartById(id);
        if (isMounted) {
          setData(res);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Error al conectar con el catálogo');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPart();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Cargando ficha del recambio...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Fallo de conexión"
          message={`No se pudo cargar la información de la pieza: ${error}. Por honestidad en el inventario, no se muestran datos ficticios.`}
          actionLabel="Reintentar"
          onAction={() => router.replace({ pathname: '/part/[id]', params: { id } })}
          secondaryActionLabel="Volver"
          onSecondaryAction={() => router.back()}
        />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Pieza no encontrada"
          message="No se ha podido localizar este recambio en el inventario actual de los desguaces colaboradores."
        />
      </View>
    );
  }

  const { part, vendor, compatibility } = data;
  const images = part.images;
  const currentImage = images[selectedImageIndex] ?? images[0];

  const conditionLabels: Record<string, string> = {
    EXCELLENT: 'Excelente estado (sin desgastes notorios)',
    GOOD: 'Buen estado (desgaste normal de uso)',
    FAIR: 'Estado regular (marcas visibles de uso)',
    FOR_REPAIR: 'Para reparar o despiece',
    UNKNOWN: 'Estado no catalogado por el desguace',
  };

  const isAvailable = part.availability.status === 'AVAILABLE';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Photo Gallery */}
        <View style={styles.galleryContainer}>
          {currentImage && !failedImages.has(currentImage.id) ? (
            <Image
              source={{ uri: currentImage.url }}
              style={styles.mainImage}
              resizeMode="cover"
              onError={() => {
                setFailedImages((prev) => new Set(prev).add(currentImage.id));
              }}
            />
          ) : (
            <View style={styles.mainImagePlaceholder}>
              <Text style={styles.noPhotoText}>[Fotografía no disponible]</Text>
              <Text style={styles.noPhotoSub}>
                No se pudo cargar la imagen del desguace
              </Text>
            </View>
          )}

          {/* Thumbnails */}
          {images.length > 1 && (
            <ScrollView horizontal style={styles.thumbScroll} showsHorizontalScrollIndicator={false}>
              {images.map((img, idx) => (
                <Pressable
                  key={img.id}
                  style={[
                    styles.thumbWrapper,
                    selectedImageIndex === idx && styles.thumbWrapperActive,
                  ]}
                  onPress={() => setSelectedImageIndex(idx)}
                >
                  <Image source={{ uri: img.url }} style={styles.thumbImage} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Content Sheet */}
        <View style={styles.sheet}>
          {/* Header & Price */}
          <Text style={styles.title}>{part.title}</Text>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.price}>{formatMoney(part.price)}</Text>
              <Text style={styles.vatNote}>
                {vendor.policies.shippingPolicySummary?.includes('IVA incluido')
                  ? 'IVA incluido · Transporte según destino'
                  : 'Precio base de inventario · Consultar condiciones en CAT'}
              </Text>
            </View>

            <View
              style={[
                styles.stockPill,
                isAvailable ? styles.stockPillAvailable : styles.stockPillUnavailable,
              ]}
            >
              <Text
                style={[
                  styles.stockPillText,
                  isAvailable ? styles.stockTextAvailable : styles.stockTextUnavailable,
                ]}
              >
                {isAvailable ? 'En stock (confirmar con CAT)' : 'Agotado'}
              </Text>
            </View>
          </View>

          {/* Compatibility Signal Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Verificación de compatibilidad</Text>
            <CompatibilityBadge signal={compatibility} showDetails />
          </View>

          {/* References Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Referencias de la pieza</Text>
            {part.oemReferences.length > 0 ? (
              part.oemReferences.map((ref, idx) => {
                const isVisual =
                  ref.referenceType === 'REFERENCIA_VISUAL' ||
                  ref.brandName === 'REFERENCIA_VISUAL';
                const isCatalog =
                  ref.referenceType === 'CATALOGO_PROVEEDOR' ||
                  ref.brandName === 'CATALOGO_PROVEEDOR';
                const isCross =
                  ref.referenceType === 'CROSS_REFERENCE' ||
                  ref.brandName === 'CROSS_REFERENCE';

                let badgeLabel = 'OEM Oficial';
                let helperText = `(Norm: ${ref.normalized})`;
                let badgeStyle = styles.officialOemBadge;
                let textStyle = styles.officialOemText;

                if (isVisual) {
                  badgeLabel = 'Referencia visual del proveedor';
                  helperText = '(Lectura de etiqueta/troquelado · No verificada como OEM oficial)';
                  badgeStyle = styles.visualBadge;
                  textStyle = styles.visualText;
                } else if (isCatalog) {
                  badgeLabel = 'Referencia interna de catálogo';
                  helperText = `(Código de inventario del CAT: ${ref.normalized})`;
                  badgeStyle = styles.catalogBadge;
                  textStyle = styles.catalogText;
                } else if (isCross) {
                  badgeLabel = 'Referencia cruzada / Equivalencia';
                  helperText = `(Cruce de recambio: ${ref.normalized})`;
                  badgeStyle = styles.crossBadge;
                  textStyle = styles.crossText;
                } else if (ref.isPrimary) {
                  badgeLabel = 'Referencia OEM oficial (Principal)';
                  helperText = `(OEM verificado: ${ref.normalized})`;
                } else {
                  badgeLabel = 'Referencia OEM oficial (Equivalente)';
                  helperText = `(OEM alternativo: ${ref.normalized})`;
                }

                return (
                  <View key={idx} style={styles.oemItemBlock}>
                    <View style={styles.oemRow}>
                      <View style={[styles.oemBadgeContainer, badgeStyle]}>
                        <Text style={[styles.oemBadgeText, textStyle]}>{badgeLabel}</Text>
                      </View>
                      <Text style={styles.oemCode}>{ref.raw}</Text>
                    </View>
                    <Text style={styles.oemNorm}>{helperText}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyFieldText}>
                No se especificó ninguna referencia en el inventario del vendedor.
              </Text>
            )}
          </View>

          {/* Donor Vehicle Specifications */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Vehículo donante de origen</Text>
            {part.donorVehicle ? (
              <View style={styles.specTable}>
                <View style={styles.specRow}>
                  <Text style={styles.specKey}>Marca y modelo</Text>
                  <Text style={styles.specVal}>
                    {part.donorVehicle.make} {part.donorVehicle.model}
                  </Text>
                </View>

                {part.donorVehicle.generation && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Generación / Versión</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.generation}</Text>
                  </View>
                )}

                {part.donorVehicle.yearFrom && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Año de fabricación</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.yearFrom}</Text>
                  </View>
                )}

                {part.donorVehicle.engineCode && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Código de motor</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.engineCode}</Text>
                  </View>
                )}

                {part.donorVehicle.fuel && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Combustible</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.fuel}</Text>
                  </View>
                )}

                {part.donorVehicle.donorVehicleCode && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Código vehículo donante</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.donorVehicleCode}</Text>
                  </View>
                )}

                {part.donorVehicle.donorVinMasked && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Bastidor anonimizado</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.donorVinMasked}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.emptyFieldText}>
                Datos específicos del vehículo donante no facilitados por el desguace.
              </Text>
            )}
          </View>

          {/* Condition and Testing */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Estado y comprobación funcional</Text>
            <View style={styles.specRow}>
              <Text style={styles.specKey}>Estado visual</Text>
              <Text style={styles.specVal}>
                {conditionLabels[part.condition] ?? part.condition}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specKey}>Test funcional</Text>
              <Text style={styles.specVal}>
                {part.testedStatus === 'TESTED_WORKING'
                  ? 'Comprobado en banco de pruebas'
                  : 'Sin prueba funcional'}
              </Text>
            </View>
            {part.description && (
              <View style={styles.descriptionBox}>
                <Text style={styles.specKey}>Observaciones del desguace:</Text>
                <Text style={styles.descriptionText}>{part.description}</Text>
              </View>
            )}
          </View>

          {/* Seller / CAT Details */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Desguace vendedor (Centro CAT)</Text>
            <Text style={styles.vendorLegalName}>{vendor.legalName}</Text>
            <Text style={styles.vendorTradeName}>Comercial: {vendor.tradeName}</Text>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Autorización ambiental:</Text>
              <Text style={styles.vendorMetaValue}>{vendor.catAuthorizationCode}</Text>
            </View>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Ubicación:</Text>
              <Text style={styles.vendorMetaValue}>
                {vendor.location.city} ({vendor.location.province}), {vendor.location.postalCode}
              </Text>
            </View>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Garantía legal:</Text>
              <Text style={styles.vendorMetaValue}>
                {vendor.policies.warrantyMonths} meses (RD 265/2021)
              </Text>
            </View>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Plazo de desistimiento:</Text>
              <Text style={styles.vendorMetaValue}>
                {vendor.policies.returnDays} días naturales para devoluciones
              </Text>
            </View>

            <Text style={styles.syncNotice}>
              Última sincronización de catálogo:{' '}
              {new Date(part.lastSyncedAt).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Text style={styles.disclaimerText}>
              Aviso de disponibilidad: El inventario del CAT se actualiza con frecuencia diaria. La disponibilidad final en el almacén físico debe ser confirmada previamente por el vendedor.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={styles.floatingBar}>
        <View style={styles.floatingPriceBox}>
          <Text style={styles.floatingPrice}>{formatMoney(part.price)}</Text>
          <Text style={styles.floatingVat}>IVA incluido</Text>
        </View>

        <Pressable
          style={[styles.inquiryBtn, !isAvailable && styles.inquiryBtnDisabled]}
          onPress={() => setInquiryModalVisible(true)}
        >
          <Text style={styles.inquiryBtnText}>
            {isAvailable ? 'Consultar disponibilidad' : 'Consultar recambio'}
          </Text>
        </Pressable>
      </View>

      {/* Inquiry Modal */}
      <InquiryModal
        visible={inquiryModalVisible}
        part={part}
        vendor={vendor}
        onClose={() => setInquiryModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 110, // Avoid bottom floating bar overlap
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  container: {
    padding: spacing.md,
  },
  galleryContainer: {
    width: '100%',
    backgroundColor: colors.cardSecondary,
  },
  mainImage: {
    width: '100%',
    height: 260,
  },
  mainImagePlaceholder: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  noPhotoText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 4,
  },
  noPhotoSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  thumbScroll: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
  },
  thumbWrapper: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbWrapperActive: {
    borderColor: colors.accent,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  sheet: {
    padding: spacing.lg,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  price: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  vatNote: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  stockPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  stockPillAvailable: {
    backgroundColor: colors.verifiedBg,
  },
  stockPillUnavailable: {
    backgroundColor: colors.dangerBg,
  },
  stockPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stockTextAvailable: {
    color: colors.verified,
  },
  stockTextUnavailable: {
    color: colors.danger,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  oemItemBlock: {
    marginBottom: spacing.sm,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardSecondary,
  },
  oemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  oemBadgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  oemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  visualBadge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  visualText: {
    color: colors.warning,
  },
  officialOemBadge: {
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
  },
  officialOemText: {
    color: colors.verified,
  },
  catalogBadge: {
    backgroundColor: colors.neutralBg,
    borderColor: colors.neutralBorder,
  },
  catalogText: {
    color: colors.neutralStatus,
  },
  crossBadge: {
    backgroundColor: colors.neutralBg,
    borderColor: colors.accent,
  },
  crossText: {
    color: colors.accent,
  },
  oemCode: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  oemNorm: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyFieldText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  specTable: {
    gap: 4,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardSecondary,
  },
  specKey: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  specVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  descriptionBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  descriptionText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
    marginTop: 2,
  },
  vendorLegalName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  vendorTradeName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  vendorMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vendorMetaLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  vendorMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  syncNotice: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  disclaimerText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 15,
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingPriceBox: {
    marginRight: spacing.md,
  },
  floatingPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  floatingVat: {
    fontSize: 11,
    color: colors.textMuted,
  },
  inquiryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    flex: 1,
    alignItems: 'center',
  },
  inquiryBtnDisabled: {
    backgroundColor: colors.textMuted,
  },
  inquiryBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 14,
  },
});
