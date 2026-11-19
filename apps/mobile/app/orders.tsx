import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState } from '../components/EmptyState';
import { AsyncStorageCartStorage } from '../services/cart-storage';
import { checkoutService } from '../services/checkout.service';
import type { OrderDetail } from '../services/checkout.service';
import { listOrderHistory } from '../services/pending-orders.service';
import type { PendingOrder } from '../services/pending-orders.service';
import { buildOrderHref } from '../services/order-link';
import { describeOrderStatus } from '../services/order-status';
import { borderRadius, colors, spacing } from '../theme/index';

interface OrderRow {
  readonly entry: PendingOrder;
  /** undefined while loading; null when the backend could not be reached. */
  readonly detail: OrderDetail | null | undefined;
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Orders placed from this device. There are no accounts in the MVP: the list comes from
 * local storage and each order is read from the backend with its own access token.
 */
export default function OrdersScreen() {
  const [rows, setRows] = useState<readonly OrderRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      async function load() {
        const history = await listOrderHistory(new AsyncStorageCartStorage());
        if (!isActive) return;
        setRows((prev) =>
          history.map((entry) => ({
            entry,
            detail: prev?.find((r) => r.entry.accessToken === entry.accessToken)?.detail,
          }))
        );

        await Promise.all(
          history.map(async (entry) => {
            const detail = await checkoutService.getOrderByAccessToken(entry.accessToken);
            if (!isActive) return;
            setRows((prev) =>
              (prev ?? []).map((r) => (r.entry.accessToken === entry.accessToken ? { ...r, detail } : r))
            );
          })
        );
      }

      load();
      return () => {
        isActive = false;
      };
    }, [])
  );

  if (rows === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Aún no tienes pedidos"
          message="Los pedidos que hagas desde este dispositivo aparecerán aquí, con su estado y el seguimiento del envío."
          actionLabel="Buscar recambios"
          onAction={() => router.replace('/')}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.entry.accessToken}
      contentContainerStyle={styles.list}
      ListFooterComponent={
        <Text style={styles.footnote}>Solo se muestran los pedidos hechos desde este dispositivo.</Text>
      }
      renderItem={({ item }) => {
        const { entry, detail } = item;
        const status = detail ? describeOrderStatus(detail) : null;
        const tracking = detail?.suborders.find((s) => s.trackingNumber);
        return (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() =>
              router.push(
                buildOrderHref({ reference: entry.reference, accessToken: entry.accessToken }, Platform.OS) as Href
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`Pedido ${entry.reference}, ${status?.label ?? 'estado no disponible'}`}
          >
            <View style={styles.cardBody}>
              <Text style={styles.reference}>{entry.reference}</Text>
              <Text style={styles.meta}>
                {formatDate(entry.createdAt)} · {entry.partIds.length}{' '}
                {entry.partIds.length === 1 ? 'pieza' : 'piezas'}
                {detail ? ` · ${(detail.totalOrderCents / 100).toFixed(2).replace('.', ',')} ${detail.currency}` : ''}
              </Text>
              {detail === undefined && <Text style={styles.meta}>Consultando estado...</Text>}
              {detail === null && (
                <Text style={styles.meta}>No se pudo consultar el estado. Toca para reintentar.</Text>
              )}
              {status && <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>}
              {tracking && (
                <Text style={styles.meta}>
                  {tracking.shippingCarrier ? `${tracking.shippingCarrier} · ` : ''}Seguimiento: {tracking.trackingNumber}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 64,
  },
  cardPressed: {
    opacity: 0.8,
  },
  cardBody: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  reference: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  status: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
