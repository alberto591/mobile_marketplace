import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCart } from '../../services/cart-context';
import type { OrderDetail } from '../../services/checkout.service';
import { checkoutService } from '../../services/checkout.service';
import { borderRadius, colors, spacing } from '../../theme/index';

export default function OrderDetailScreen() {
  const params = useLocalSearchParams<{ reference: string; token: string; orderedPartIds?: string }>();
  const { removeItems } = useCart();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reference = params.reference;
  const token = params.token;
  const orderedPartIds = params.orderedPartIds;

  useEffect(() => {
    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchOrder() {
      if (!token) {
        if (isMounted) {
          setError('No se proporcionó token de acceso seguro para el pedido.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const data = await checkoutService.getOrderByAccessToken(token);
        if (!isMounted) return;

        if (data) {
          setOrder(data);
          setIsLoading(false);

          // If order is paid or processing and we have orderedPartIds, clear them from the local cart
          if (data.status === 'PAID' || data.status === 'PAYMENT_PROCESSING') {
            if (orderedPartIds) {
              try {
                const ids = JSON.parse(orderedPartIds);
                if (Array.isArray(ids) && ids.length > 0) {
                  removeItems(ids);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }

          // If still pending, poll a couple of times for webhook confirmation
          if (data.status === 'PENDING_PAYMENT' || data.status === 'PAYMENT_PROCESSING') {
            pollTimer = setTimeout(fetchOrder, 3000);
          }
        } else {
          setError('No se pudo localizar el pedido con la clave proporcionada.');
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Error al consultar el estado del pedido.');
          setIsLoading(false);
        }
      }
    }

    fetchOrder();

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [token, orderedPartIds]);

  const getStatusLabel = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'PAID':
        return { label: 'PAGO CONFIRMADO', color: '#16A34A' };
      case 'PAYMENT_PROCESSING':
        return { label: 'CONFIRMANDO CON EL BANCO...', color: '#D97706' };
      case 'PENDING_PAYMENT':
        return { label: 'PENDIENTE DE PAGO', color: '#64748B' };
      case 'PAYMENT_FAILED':
        return { label: 'PAGO FALLIDO', color: '#DC2626' };
      case 'CANCELLED':
        return { label: 'PEDIDO CANCELADO', color: '#DC2626' };
      case 'REFUNDED':
        return { label: 'REEMBOLSADO', color: '#475569' };
      default:
        return { label: status, color: '#64748B' };
    }
  };

  const getFulfillmentLabel = (status: string): string => {
    switch (status) {
      case 'AWAITING_PAYMENT':
        return 'En espera de confirmación de pago';
      case 'AWAITING_SELLER_FULFILLMENT':
        return 'Pendiente de preparación en el desguace';
      case 'PROCESSING':
        return 'En preparación en almacén';
      case 'SHIPPED':
        return 'Enviado por agencia de transporte';
      case 'DELIVERED':
        return 'Entregado al destinatario';
      default:
        return status;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Consultando estado del pedido...</Text>
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Error al consultar pedido</Text>
        <Text style={styles.errorSubtitle}>{error ?? 'Pedido no encontrado'}</Text>
        <Pressable style={styles.actionBtn} onPress={() => router.replace('/')}>
          <Text style={styles.actionBtnText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  const statusInfo = getStatusLabel(order.status);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Test Mode Banner */}
      {order.isTestOrder && (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerTitle}>PEDIDO DE PRUEBAS STAGING</Text>
          <Text style={styles.testBannerText}>
            Este pedido ha sido tramitado en entorno de pruebas técnicas de Stripe Connect. No se ha producido ningún cargo real ni se expedirán piezas físicas.
          </Text>
        </View>
      )}

      {/* Main Order Card */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.labelMuted}>Referencia del pedido</Text>
            <Text style={styles.orderReference}>{order.orderReference}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
            <Text style={styles.statusBadgeText}>{statusInfo.label}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>
          Fecha de registro: {new Date(order.createdAt).toLocaleString('es-ES')}
        </Text>
      </View>

      {/* Delivery Address */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Dirección de entrega</Text>
        <Text style={styles.recipientName}>{order.customerName}</Text>
        <Text style={styles.addressLine}>{order.shippingAddress.line1}</Text>
        {order.shippingAddress.line2 && <Text style={styles.addressLine}>{order.shippingAddress.line2}</Text>}
        <Text style={styles.addressLine}>
          {order.shippingAddress.postalCode} {order.shippingAddress.city} ({order.shippingAddress.province})
        </Text>
        <Text style={styles.contactEmail}>{order.customerEmail}</Text>
      </View>

      {/* Suborders by Scrap Yard */}
      {order.suborders.map((suborder) => (
        <View key={suborder.suborderReference} style={styles.card}>
          <Text style={styles.sectionTitle}>Desguace vendedor</Text>
          <Text style={styles.vendorName}>{suborder.vendorTradeName}</Text>
          <Text style={styles.suborderRef}>Subpedido: {suborder.suborderReference}</Text>

          {/* Fulfillment Status */}
          <View style={styles.fulfillmentBox}>
            <Text style={styles.fulfillmentLabel}>Estado de expedición:</Text>
            <Text style={styles.fulfillmentValue}>{getFulfillmentLabel(suborder.fulfillmentStatus)}</Text>
            {suborder.trackingNumber && (
              <Text style={styles.trackingInfo}>
                Transportista: {suborder.shippingCarrier ?? 'Agencia'} · Nº Seguimiento: {suborder.trackingNumber}
              </Text>
            )}
          </View>

          {/* Items */}
          <View style={styles.itemsList}>
            {suborder.items.map((item) => (
              <View key={item.partId} style={styles.itemRow}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemSku}>Ref: {item.externalPartId}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {(item.unitPriceCents / 100).toFixed(2).replace('.', ',')} EUR
                </Text>
              </View>
            ))}
          </View>

          {/* Suborder Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Subtotal piezas</Text>
              <Text style={styles.breakdownValue}>
                {(suborder.subtotalCents / 100).toFixed(2).replace('.', ',')} EUR
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Gastos de envío</Text>
              <Text style={styles.breakdownValue}>
                {(suborder.shippingCents / 100).toFixed(2).replace('.', ',')} EUR
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Total subpedido</Text>
              <Text style={[styles.breakdownValue, { fontWeight: '700' }]}>
                {(suborder.totalCents / 100).toFixed(2).replace('.', ',')} EUR
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* Actions */}
      <View style={styles.buttonGroup}>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.primaryBtnText}>Volver al catálogo</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push('/cart')}>
          <Text style={styles.secondaryBtnText}>Ver carrito</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  errorSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  testBanner: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    marginBottom: spacing.md,
  },
  testBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.warning,
    marginBottom: 4,
  },
  testBannerText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelMuted: {
    fontSize: 11,
    color: colors.textMuted,
  },
  orderReference: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  addressLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  contactEmail: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  suborderRef: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  fulfillmentBox: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  fulfillmentLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  fulfillmentValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    marginTop: 2,
  },
  trackingInfo: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  itemsList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  itemSku: {
    fontSize: 10,
    color: colors.textMuted,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalsSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  breakdownLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  buttonGroup: {
    marginTop: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  actionBtnText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
});
