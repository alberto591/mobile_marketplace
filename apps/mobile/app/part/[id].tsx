import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, getPrimaryOEMReference } from '@mobile-marketplace/core';
import { CatTrustModal } from '../../components/CatTrustModal';
import { CompatibilityBadge } from '../../components/CompatibilityBadge';
import { EmptyState } from '../../components/EmptyState';
import { InquiryModal } from '../../components/InquiryModal';
import { SavingsAndCircularCard } from '../../components/SavingsAndCircularCard';
import {
  estimateAdemeEnvironmentalImpact,
  findCuratedComparableNewPrice,
} from '../../services/savings-comparison.service';
import { useCart } from '../../services/cart-context';
import type { PartDetailResult } from '../../services/catalog-service.interface';
import { catalogService } from '../../services/catalog-service.factory';
import { useFavourites } from '../../services/favourites-context';
import { useGarage } from '../../services/garage-context';
import { evaluateSellerTrust } from '../../services/seller-trust.service';
import { sharePartNative } from '../../services/share-part.service';
import { openWhatsAppContact } from '../../services/whatsapp-contact.service';
import { borderRadius, colors, spacing, typography } from '../../theme/index';

export default function PartDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isInCart, addItem } = useCart();
  const { isSaved, toggleSaved } = useFavourites();
  const { selectedVehicle } = useGarage();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PartDetailResult | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);
  const [catModalVisible, setCatModalVisible] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPart() {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.getPartById(
          id,
          selectedVehicle
            ? {
                make: selectedVehicle.make,
                model: selectedVehicle.model,
                year: selectedVehicle.year,
              }
            : undefined
        );
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
  }, [id, selectedVehicle]);

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
  const trust = evaluateSellerTrust(vendor);
  const images = part.images;
  const currentImage = images[selectedImageIndex] ?? images[0];

  const conditionLabels: Record<string, string> = {
    EXCELLENT: 'Excelente estado (sin desgastes notorios)',
    GOOD: 'Buen estado (desgaste normal de uso)',
    FAIR: 'Estado regular (marcas visibles de uso)',
    FOR_REPAIR: 'Para reparar o despiece',
    UNKNOWN: 'Estado no catalogado por el desguace',
  };

  const inCart = isInCart(part.id);
  const status = part.availability.status;
  const isAvailable = status === 'AVAILABLE' && part.availability.stockQuantity > 0;
  const isPending =
    status === 'PENDING_CONFIRMATION' || (status === 'AVAILABLE' && part.availability.stockQuantity <= 0);

  const handleActionPress = () => {
    if (isAvailable) {
      if (inCart) {
        router.push('/cart');
      } else {
        const res = addItem(part, vendor);
        if (!res.success && res.reason) {
          Alert.alert('Aviso', res.reason);
        }
      }
      return;
    }

    if (isPending) {
      setInquiryModalVisible(true);
      return;
    }
  };

  const handleWhatsAppPress = async () => {
    if (!data?.part || !data?.vendor) return;

    const primaryRef = data.part.oemReferences.find((r) => r.isPrimary) ?? data.part.oemReferences[0];

    await openWhatsAppContact({
      publicPhone: data.vendor.contact?.publicPhone,
      partTitle: data.part.title,
      priceFormatted: formatMoney(data.part.price),
      listingId: data.part.source.externalPartId || data.part.id.substring(0, 8),
      vendorTradeName: data.vendor.tradeName,
      primaryReference: primaryRef
        ? {
            raw: primaryRef.raw,
            isOem: primaryRef.referenceType === 'OEM_OFFICIAL',
            referenceType: primaryRef.referenceType,
          }
        : undefined,
      onUnavailable: (phone) => {
        Alert.alert(
          'WhatsApp no disponible',
          phone
            ? `No se pudo iniciar WhatsApp. Puedes contactar directamente al centro en el teléfono: ${phone}`
            : 'Este desguace no dispone de número de WhatsApp verificado. Puedes tramitar tu consulta a través del botón de consulta en la app.'
        );
      },
    });
  };

  const handleSharePress = async () => {
    if (!data?.part || !data?.vendor) return;

    const primaryRef = data.part.oemReferences.find((r) => r.isPrimary) ?? data.part.oemReferences[0];

    await sharePartNative({
      partId: data.part.id,
      externalPartId: data.part.source.externalPartId,
      partTitle: data.part.title,
      priceFormatted: formatMoney(data.part.price),
      vendorTradeName: data.vendor.tradeName,
      primaryReference: primaryRef
        ? {
            raw: primaryRef.raw,
            isOem: primaryRef.referenceType === 'OEM_OFFICIAL',
            referenceType: primaryRef.referenceType,
          }
        : undefined,
    });
  };

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
          <View style={styles.titleRow}>
            <Text style={styles.title}>{part.title}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.detailFavBtn,
                isSaved(part.id) && styles.detailFavBtnActive,
                pressed && styles.detailFavBtnPressed,
              ]}
              onPress={() => toggleSaved(part.id)}
              accessibilityRole="button"
              accessibilityLabel={
                isSaved(part.id)
                  ? 'Quitar de piezas guardadas'
                  : 'Guardar esta pieza en favoritos'
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isSaved(part.id) ? 'heart' : 'heart-outline'}
                size={22}
                color={isSaved(part.id) ? colors.accent : colors.textSecondary}
              />
            </Pressable>
          </View>
          <View style={styles.priceRow}>
            <View>
              <Text style={styles.price}>{formatMoney(part.price)}</Text>
              <Text style={styles.vatNote}>
                Precio publicado por el desguace · Impuestos y portes por confirmar
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
                {isAvailable ? 'Figura disponible en catálogo' : 'Agotado'}
              </Text>
            </View>
          </View>

          {/* Compatibility Signal Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeading}>Verificación de compatibilidad</Text>
            <CompatibilityBadge signal={compatibility} showDetails />
          </View>

          {/* Savings & Circular Economy Section */}
          <SavingsAndCircularCard
            usedPriceCents={part.price.amountInCents}
            comparableNewPrice={findCuratedComparableNewPrice({
              partId: part.id,
              oemReference: getPrimaryOEMReference(part)?.normalized,
              title: part.title,
            })}
            environmentalImpact={estimateAdemeEnvironmentalImpact(part.categoryId, part.title)}
          />

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

                {Boolean(part.donorVehicle.generation) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Generación / Versión</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.generation}</Text>
                  </View>
                )}

                {Boolean(part.donorVehicle.yearFrom) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Año de fabricación</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.yearFrom}</Text>
                  </View>
                )}

                {Boolean(part.donorVehicle.engineCode) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Código de motor</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.engineCode}</Text>
                  </View>
                )}

                {Boolean(part.donorVehicle.fuel) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Combustible</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.fuel}</Text>
                  </View>
                )}

                {Boolean(part.donorVehicle.donorVehicleCode) && (
                  <View style={styles.specRow}>
                    <Text style={styles.specKey}>Código vehículo donante</Text>
                    <Text style={styles.specVal}>{part.donorVehicle.donorVehicleCode}</Text>
                  </View>
                )}

                {Boolean(part.donorVehicle.donorVinMasked) && (
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
            {Boolean(part.description) && (
              <View style={styles.descriptionBox}>
                <Text style={styles.specKey}>Observaciones del desguace:</Text>
                <Text style={styles.descriptionText}>{part.description}</Text>
              </View>
            )}
          </View>

          {/* Seller / CAT Details */}
          <View style={styles.sectionCard}>
            <View style={styles.sellerHeaderRow}>
              <Text style={styles.sectionHeading}>Desguace vendedor (Centro CAT)</Text>
              <Pressable
                style={[
                  styles.catStatusBadge,
                  trust.isCatVerified ? styles.catBadgeVerified : styles.catBadgeUnverified,
                ]}
                onPress={() => setCatModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Ver información legal y garantías del vendedor"
              >
                <Ionicons
                  name={trust.isCatVerified ? 'shield-checkmark' : 'alert-circle-outline'}
                  size={13}
                  color={trust.isCatVerified ? colors.verified : colors.warning}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.catBadgeText,
                    trust.isCatVerified
                      ? styles.catBadgeTextVerified
                      : styles.catBadgeTextUnverified,
                  ]}
                >
                  {trust.badgeLabel}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.vendorLegalName}>{trust.legalSellerName}</Text>
            <Text style={styles.vendorTradeName}>Comercial: {trust.tradeName}</Text>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Autorización ambiental:</Text>
              <Text style={styles.vendorMetaValue}>{trust.catAuthorizationCode}</Text>
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
                {trust.warrantyMonths} meses mínimos (RDLeg 1/2007)
              </Text>
            </View>

            <View style={styles.vendorMetaRow}>
              <Text style={styles.vendorMetaLabel}>Plazo de desistimiento:</Text>
              <Text style={styles.vendorMetaValue}>
                {trust.returnDays} días naturales (Venta a distancia)
              </Text>
            </View>

            <Pressable
              style={styles.legalInfoLink}
              onPress={() => setCatModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Consultar información legal y política de garantías del vendedor"
            >
              <Text style={styles.legalInfoLinkText}>
                Consultar política de garantías, devoluciones y acreditación CAT
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.accent} />
            </Pressable>

            {/* WhatsApp Contact Action */}
            {vendor.contact?.publicPhone ? (
              <Pressable
                style={({ pressed }) => [
                  styles.whatsappButton,
                  pressed && styles.whatsappButtonPressed,
                ]}
                onPress={handleWhatsAppPress}
                accessibilityRole="button"
                accessibilityLabel={`Preguntar por WhatsApp a ${vendor.tradeName}`}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.whatsappButtonText}>Preguntar por WhatsApp</Text>
              </Pressable>
            ) : (
              <View style={styles.noWhatsappInfo}>
                <Text style={styles.noWhatsappText}>
                  Contacto telefónico directo no publicado por este desguace.
                </Text>
              </View>
            )}

            {/* Share Action */}
            <Pressable
              style={({ pressed }) => [
                styles.shareButton,
                pressed && styles.shareButtonPressed,
              ]}
              onPress={handleSharePress}
              accessibilityRole="button"
              accessibilityLabel="Compartir esta pieza con mi mecánico o cliente"
            >
              <Ionicons name="share-social-outline" size={18} color={colors.accent} style={{ marginRight: 8 }} />
              <Text style={styles.shareButtonText}>Compartir con mi mecánico</Text>
            </Pressable>

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
              Aviso de disponibilidad: La pieza figura como disponible en el catálogo publicado por el CAT. Al no existir consulta en tiempo real ni sistema telemático de reservas, la existencia física final en estantería, impuestos aplicables y gastos de transporte deben ser confirmados previamente con el vendedor.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Floating Action Bar */}
      <View style={styles.floatingBar}>
        <View style={styles.floatingPriceBox}>
          <Text style={styles.floatingPrice}>{formatMoney(part.price)}</Text>
          <Text style={styles.floatingVat}>Impuestos y portes por confirmar</Text>
        </View>

        <View style={styles.floatingActionContainer}>
          <Pressable
            style={[
              styles.inquiryBtn,
              inCart && styles.inCartBtn,
              !isAvailable && !isPending && styles.inquiryBtnDisabled,
            ]}
            onPress={handleActionPress}
            disabled={!isAvailable && !isPending}
            accessibilityRole="button"
            accessibilityLabel={
              isAvailable
                ? inCart
                  ? 'Pieza ya en el carrito. Pulsa para ver tu selección'
                  : 'Añadir esta unidad al carrito'
                : isPending
                ? 'Consultar disponibilidad al desguace'
                : 'Pieza no disponible'
            }
          >
            <Text
              style={[
                styles.inquiryBtnText,
                inCart && styles.inCartBtnText,
              ]}
            >
              {isAvailable
                ? inCart
                  ? 'En el carrito (Ver selección)'
                  : 'Añadir al carrito'
                : isPending
                ? 'Consultar disponibilidad'
                : 'Pieza no disponible'}
            </Text>
          </Pressable>
          <Text style={styles.floatingNoticeText}>
            Figura disponible en catálogo · Disponibilidad física a confirmar con el desguace
          </Text>
        </View>
      </View>

      {/* Inquiry Modal */}
      <InquiryModal
        visible={inquiryModalVisible}
        part={part}
        vendor={vendor}
        onClose={() => setInquiryModalVisible(false)}
      />

      {/* Seller Legal & CAT Trust Modal */}
      <CatTrustModal
        visible={catModalVisible}
        vendor={vendor}
        onClose={() => setCatModalVisible(false)}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    flex: 1,
  },
  detailFavBtn: {
    padding: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailFavBtnActive: {
    backgroundColor: 'rgba(234, 88, 12, 0.1)',
    borderColor: colors.accent,
  },
  detailFavBtnPressed: {
    backgroundColor: colors.card,
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
  sellerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
    flexWrap: 'wrap',
    gap: 6,
  },
  catStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  catBadgeVerified: {
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
  },
  catBadgeUnverified: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  catBadgeTextVerified: {
    color: colors.verified,
  },
  catBadgeTextUnverified: {
    color: colors.warning,
  },
  legalInfoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  legalInfoLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    flex: 1,
    marginRight: 6,
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
  floatingActionContainer: {
    flex: 1,
    alignItems: 'center',
  },
  inquiryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  inCartBtn: {
    backgroundColor: colors.cardSecondary,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  inCartBtnText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  inquiryBtnDisabled: {
    backgroundColor: colors.textMuted,
  },
  inquiryBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 14,
  },
  floatingNoticeText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 3,
    textAlign: 'center',
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.whatsapp,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  whatsappButtonPressed: {
    opacity: 0.85,
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noWhatsappInfo: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
  },
  noWhatsappText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  shareButtonPressed: {
    backgroundColor: colors.cardSecondary,
  },
  shareButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
