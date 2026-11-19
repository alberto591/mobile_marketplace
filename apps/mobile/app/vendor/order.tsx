import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  extractVendorToken,
  VendorOrderError,
  vendorOrderService,
} from '../../services/vendor-order.service';
import type { VendorOrder } from '../../services/vendor-order.service';
import { borderRadius, colors, spacing } from '../../theme/index';

const formatCents = (cents: number, currency: string) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} ${currency}`;

/**
 * Seller page: opened from the "Marcar como enviado" button of the order email.
 * Shows the paid order and lets the scrapyard record carrier and tracking number.
 */
export default function VendorOrderScreen() {
  const params = useLocalSearchParams<{ token?: string }>();

  const [token, setToken] = useState<string | null>(null);
  const [order, setOrder] = useState<VendorOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const hash = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hash : null;
    const found = extractVendorToken({ hash, search: params.token ? `token=${params.token}` : null });

    async function load() {
      if (!found) {
        setLoadError('Este enlace no es válido. Abre el botón "Marcar como enviado" del email del pedido.');
        setLoading(false);
        return;
      }
      setToken(found);
      try {
        const data = await vendorOrderService.getOrder(found);
        if (!isMounted) return;
        setOrder(data);
        setCarrier(data.shippingCarrier ?? '');
        setTrackingNumber(data.trackingNumber ?? '');
      } catch (err) {
        if (isMounted) {
          setLoadError(err instanceof VendorOrderError ? err.message : 'No se pudo cargar el pedido.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [params.token]);

  const handleSubmit = async () => {
    if (!token || submitting) return;
    setFormError(null);
    setSavedNotice(null);

    if (carrier.trim().length < 2) {
      setFormError('Indica el transportista (por ejemplo: SEUR, MRW, GLS).');
      return;
    }
    if (trackingNumber.trim().length < 3) {
      setFormError('Indica el número de seguimiento que te ha dado el transportista.');
      return;
    }

    const wasShipped = order?.fulfillmentStatus === 'SHIPPED';
    setSubmitting(true);
    try {
      const updated = await vendorOrderService.markShipped(token, carrier, trackingNumber);
      setOrder(updated);
      setEditing(false);
      setSavedNotice(
        wasShipped
          ? 'Datos de seguimiento actualizados.'
          : 'Envío registrado. Hemos avisado al cliente con el número de seguimiento.'
      );
    } catch (err) {
      setFormError(err instanceof VendorOrderError ? err.message : 'No se pudo guardar el envío. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.muted}>Cargando pedido...</Text>
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No podemos mostrar este pedido</Text>
        <Text style={[styles.muted, styles.centerText]}>{loadError}</Text>
      </View>
    );
  }

  const isPaid = order.paymentStatus === 'SUCCEEDED';
  const isShipped = order.fulfillmentStatus === 'SHIPPED' || order.fulfillmentStatus === 'DELIVERED';
  const canEdit = isPaid && order.fulfillmentStatus !== 'DELIVERED' && order.fulfillmentStatus !== 'CANCELLED';
  const showForm = canEdit && (!isShipped || editing);
  const address = order.shippingAddress;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        {order.isTestOrder && (
          <View style={styles.testBanner}>
            <Text style={styles.testBannerText}>PEDIDO DE PRUEBA — no es una venta real, no envíes ninguna pieza.</Text>
          </View>
        )}

        <Text style={styles.title}>Pedido {order.suborderReference}</Text>
        <Text style={styles.muted}>{order.vendorTradeName}</Text>

        {!isPaid && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              Este pedido ha sido reembolsado. No hay que enviarlo; si ya salió, contacta con el cliente.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Piezas a enviar ({order.items.length})</Text>
          {order.items.map((item) => (
            <View key={item.externalPartId} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.muted}>Ref. #{item.externalPartId}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatCents(item.unitPriceCents, order.currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Enviar a</Text>
          <Text style={styles.addressName}>{order.customer.name}</Text>
          <Text style={styles.body}>{address.line1}</Text>
          {Boolean(address.line2) && <Text style={styles.body}>{address.line2}</Text>}
          <Text style={styles.body}>
            {address.postalCode} {address.city} ({address.province})
          </Text>
          <Text style={styles.body}>Teléfono: {order.customer.phone}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Importes</Text>
          <View style={styles.amountRow}>
            <Text style={styles.body}>Cobrado al cliente</Text>
            <Text style={styles.body}>{formatCents(order.totalCents, order.currency)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.body}>Comisión de la plataforma</Text>
            <Text style={styles.body}>-{formatCents(order.platformFeeCents, order.currency)}</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.amountStrong}>Neto para el desguace</Text>
            <Text style={styles.amountStrong}>{formatCents(order.sellerNetCents, order.currency)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Envío</Text>

          {Boolean(savedNotice) && (
            <View style={styles.successBox} accessibilityLiveRegion="polite">
              <Text style={styles.successText}>{savedNotice}</Text>
            </View>
          )}

          {isShipped && !editing && (
            <View>
              <Text style={styles.body}>
                Enviado con <Text style={styles.bold}>{order.shippingCarrier}</Text>
              </Text>
              <Text style={styles.body}>
                Seguimiento: <Text style={styles.bold}>{order.trackingNumber}</Text>
              </Text>
              {canEdit && (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setSavedNotice(null);
                    setEditing(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Corregir datos de seguimiento</Text>
                </Pressable>
              )}
            </View>
          )}

          {showForm && (
            <View>
              <Text style={styles.label} nativeID="carrier-label">
                Transportista
              </Text>
              <TextInput
                style={styles.input}
                value={carrier}
                onChangeText={setCarrier}
                placeholder="SEUR, MRW, GLS..."
                placeholderTextColor={colors.textMuted}
                editable={!submitting}
                maxLength={80}
                accessibilityLabel="Transportista"
                accessibilityLabelledBy="carrier-label"
              />
              <Text style={styles.label} nativeID="tracking-label">
                Número de seguimiento
              </Text>
              <TextInput
                style={styles.input}
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                placeholder="El código que te da el transportista"
                placeholderTextColor={colors.textMuted}
                editable={!submitting}
                maxLength={120}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel="Número de seguimiento"
                accessibilityLabelledBy="tracking-label"
              />

              {Boolean(formError) && (
                <View style={styles.errorBox} accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              )}

              <Pressable
                style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting, busy: submitting }}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.textInverse} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isShipped ? 'Guardar cambios' : 'Marcar como enviado'}
                  </Text>
                )}
              </Pressable>
              {!isShipped && (
                <Text style={styles.hint}>Al guardar, el cliente recibe un email con el número de seguimiento.</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  container: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  centerText: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  muted: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemPrice: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  bold: {
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  amountStrong: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    minHeight: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  testBanner: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  testBannerText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  warningText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  successBox: {
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
});
