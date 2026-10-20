import { router } from 'expo-router';
import React, { useId, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { initStripe, useStripe } from '@stripe/stripe-react-native';
import { formatMoney } from '@mobile-marketplace/core';
import { useCart } from '../services/cart-context';
import { checkoutService } from '../services/checkout.service';
import { borderRadius, colors, spacing, typography } from '../theme/index';

export default function CheckoutScreen() {
  const { items, vendorGroups, removeItems } = useCart();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  // Contact form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Shipping address state
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  // Status & processing
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable client idempotency seed per checkout session
  const [sessionSeed] = useState(() => `chk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  // Multi-vendor check
  const isMultiVendor = vendorGroups.length > 1;
  const activeVendorGroup = vendorGroups[0];
  const activeItems = useMemo(() => {
    if (!activeVendorGroup) return [];
    return items.filter((i) => i.vendor.id === activeVendorGroup.vendorId);
  }, [items, activeVendorGroup]);

  // Pricing calculation in cents
  const subtotalCents = useMemo(() => {
    return activeItems.reduce((acc, i) => acc + i.part.price.amountInCents, 0);
  }, [activeItems]);

  const shippingCents = 950; // Staging fixed test shipping
  const totalCents = subtotalCents + shippingCents;

  const validateForm = (): boolean => {
    setErrorMessage(null);

    if (!customerName.trim() || customerName.trim().length < 2) {
      setErrorMessage('Por favor, indica tu nombre completo (mínimo 2 caracteres).');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customerEmail.trim() || !emailRegex.test(customerEmail.trim())) {
      setErrorMessage('Por favor, indica una dirección de correo electrónico válida.');
      return false;
    }

    if (!customerPhone.trim() || customerPhone.trim().length < 6) {
      setErrorMessage('Por favor, indica un teléfono de contacto para la agencia de transporte.');
      return false;
    }

    if (!line1.trim() || line1.trim().length < 5) {
      setErrorMessage('Por favor, indica tu dirección de entrega (calle, número, etc.).');
      return false;
    }

    const cpRegex = /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/;
    if (!postalCode.trim() || !cpRegex.test(postalCode.trim())) {
      setErrorMessage('El código postal debe ser un código español válido de 5 dígitos (01000 - 52999).');
      return false;
    }

    if (!city.trim() || city.trim().length < 2) {
      setErrorMessage('Por favor, indica la localidad de entrega.');
      return false;
    }

    if (!province.trim() || province.trim().length < 2) {
      setErrorMessage('Por favor, indica la provincia de entrega.');
      return false;
    }

    return true;
  };

  const handlePay = async () => {
    if (!validateForm()) return;
    if (!activeVendorGroup || activeItems.length === 0) {
      setErrorMessage('No hay piezas seleccionadas para tramitar el pedido.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const partIds = activeItems.map((i) => i.part.id);
      const idempotencyKey = `${sessionSeed}_${partIds.slice().sort().join('_')}`;

      // 1. Server-side order creation & PaymentIntent generation
      const res = await checkoutService.createPaymentIntent({
        contact: {
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim().toLowerCase(),
          customerPhone: customerPhone.trim(),
        },
        address: {
          line1: line1.trim(),
          line2: line2.trim() || undefined,
          city: city.trim(),
          province: province.trim(),
          postalCode: postalCode.trim(),
          country: 'ES',
        },
        partIds,
        idempotencyKey,
      });

      if (!res.clientSecret) {
        throw new Error('No se recibió la clave secreta de pago desde el servidor.');
      }

      // 2. Bind native Stripe client to connected seller account context for Direct Charge
      const publishableKey = res.publishableKey || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
      if (!publishableKey && res.stripeAccountId !== 'acct_mock_test') {
        throw new Error('Falta la clave pública de Stripe (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY). Por favor, configúrala en las variables de entorno.');
      }

      if (res.stripeAccountId && res.stripeAccountId !== 'acct_mock_test') {
        await initStripe({
          publishableKey,
          stripeAccountId: res.stripeAccountId,
          merchantIdentifier: 'merchant.com.marketplace.recambios',
          urlScheme: 'recambios',
        });
      }

      // 3. Initialize Stripe PaymentSheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: res.clientSecret,
        merchantDisplayName: activeVendorGroup.vendor.tradeName || 'Mobile Marketplace',
        returnURL: 'recambios://stripe-redirect',
        allowsDelayedPaymentMethods: false,
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // 3. Present Stripe PaymentSheet to customer
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          // Customer cancelled payment sheet; preserve cart and form
          setIsSubmitting(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // 4. PaymentSheet returned success -> Redirect to order tracking screen
      // The order screen checks backend authority before clearing the cart.
      router.replace({
        pathname: '/order/[reference]',
        params: {
          reference: res.orderReference,
          token: res.accessToken,
          orderedPartIds: JSON.stringify(partIds),
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error procesando el pago. Tu carrito se mantiene intacto.');
      setIsSubmitting(false);
    }
  };

  if (activeItems.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.headerTitle}>No hay recambios seleccionados</Text>
          <Text style={styles.subtitle}>Regresa al carrito para seleccionar las piezas que necesitas.</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/cart')}>
            <Text style={styles.secondaryBtnText}>Volver al carrito</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Test Mode Banner */}
        <View style={styles.stagingBanner}>
          <View style={styles.badgeStaging}>
            <Text style={styles.badgeStagingText}>MODO PRUEBAS · STAGING</Text>
          </View>
          <Text style={styles.stagingBannerTitle}>Entorno de simulación de pagos Stripe Connect</Text>
          <Text style={styles.stagingBannerText}>
            No se realizarán cobros reales en tu tarjeta bancaria. Los impuestos figuran sin calcular (0,00 EUR) y los portes están fijados en 9,50 EUR a efectos de prueba técnica.
          </Text>
        </View>

        {/* Multi-Vendor Warning */}
        {isMultiVendor && (
          <View style={styles.multiVendorWarning}>
            <Text style={styles.multiVendorTitle}>Carrito multiproveedor detectado</Text>
            <Text style={styles.multiVendorText}>
              El primer lanzamiento procesa un único desguace por pedido. En esta transacción se tramitarán únicamente las piezas de{' '}
              <Text style={{ fontWeight: '700' }}>{activeVendorGroup.vendor.tradeName}</Text>. Los recambios de los demás vendedores se mantendrán en tu carrito para una compra posterior.
            </Text>
          </View>
        )}

        {/* Seller Info */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Vendedor legal de las piezas</Text>
          <Text style={styles.vendorName}>{activeVendorGroup.vendor.tradeName}</Text>
          <Text style={styles.vendorLegal}>{activeVendorGroup.vendor.legalName} · {activeVendorGroup.vendor.catAuthorizationCode}</Text>
          <Text style={styles.vendorLocation}>{activeVendorGroup.vendor.location.city} ({activeVendorGroup.vendor.location.province})</Text>

          <View style={styles.partsSummaryList}>
            {activeItems.map((item) => (
              <View key={item.part.id} style={styles.partSummaryRow}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text style={styles.partSummaryTitle} numberOfLines={1}>{item.part.title}</Text>
                  <Text style={styles.partSummarySku}>Ref: {item.part.source.externalPartId}</Text>
                </View>
                <Text style={styles.partSummaryPrice}>{formatMoney(item.part.price)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Contact Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Datos de contacto del comprador</Text>

          <Text style={styles.inputLabel}>Nombre completo *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Juan Pérez García"
            placeholderTextColor={colors.textMuted}
            value={customerName}
            onChangeText={setCustomerName}
            editable={!isSubmitting}
          />

          <Text style={styles.inputLabel}>Correo electrónico *</Text>
          <TextInput
            style={styles.input}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={colors.textMuted}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isSubmitting}
          />

          <Text style={styles.inputLabel}>Teléfono móvil (para la entrega) *</Text>
          <TextInput
            style={styles.input}
            placeholder="+34 600 000 000"
            placeholderTextColor={colors.textMuted}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            keyboardType="phone-pad"
            editable={!isSubmitting}
          />
        </View>

        {/* Delivery Address Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>2. Dirección de entrega (España)</Text>

          <Text style={styles.inputLabel}>Dirección (calle, número, piso) *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Calle Gran Vía 12, 3º B"
            placeholderTextColor={colors.textMuted}
            value={line1}
            onChangeText={setLine1}
            editable={!isSubmitting}
          />

          <Text style={styles.inputLabel}>Información adicional (opcional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Bloque 2, escalera derecha"
            placeholderTextColor={colors.textMuted}
            value={line2}
            onChangeText={setLine2}
            editable={!isSubmitting}
          />

          <View style={styles.rowInputs}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Text style={styles.inputLabel}>Código Postal *</Text>
              <TextInput
                style={styles.input}
                placeholder="29004"
                placeholderTextColor={colors.textMuted}
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="numeric"
                maxLength={5}
                editable={!isSubmitting}
              />
            </View>

            <View style={{ flex: 1.5 }}>
              <Text style={styles.inputLabel}>Localidad / Ciudad *</Text>
              <TextInput
                style={styles.input}
                placeholder="Málaga"
                placeholderTextColor={colors.textMuted}
                value={city}
                onChangeText={setCity}
                editable={!isSubmitting}
              />
            </View>
          </View>

          <Text style={styles.inputLabel}>Provincia *</Text>
          <TextInput
            style={styles.input}
            placeholder="Málaga"
            placeholderTextColor={colors.textMuted}
            value={province}
            onChangeText={setProvince}
            editable={!isSubmitting}
          />
        </View>

        {/* Pricing Breakdown */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>3. Resumen y desglose de costes</Text>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Subtotal recambios ({activeItems.length})</Text>
            <Text style={styles.breakdownValue}>{(subtotalCents / 100).toFixed(2).replace('.', ',')} EUR</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Gastos de envío (Tarifa de pruebas Staging)</Text>
            <Text style={styles.breakdownValue}>9,50 EUR</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Impuestos aplicables (IVA / REBU)</Text>
            <Text style={[styles.breakdownValue, { color: colors.warning }]}>0,00 EUR *</Text>
          </View>

          <View style={styles.taxNotice}>
            <Text style={styles.taxNoticeText}>
              * Régimen fiscal pendiente de configuración. El importe total mostrado no representa una oferta comercial definitiva.
            </Text>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.breakdownRow}>
            <Text style={styles.totalLabel}>Total a pagar en pruebas</Text>
            <Text style={styles.totalValue}>{(totalCents / 100).toFixed(2).replace('.', ',')} EUR</Text>
          </View>
        </View>

        {/* Error Banner */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Pay Button */}
        <Pressable
          style={[styles.payButton, isSubmitting && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Pagar con Stripe en modo pruebas"
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.payButtonText}>Pagar con Stripe (Modo Pruebas)</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  stagingBanner: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    marginBottom: spacing.md,
  },
  badgeStaging: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  badgeStagingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000000',
  },
  stagingBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stagingBannerText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  multiVendorWarning: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    marginBottom: spacing.md,
  },
  multiVendorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  multiVendorText: {
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vendorName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  vendorLegal: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  vendorLocation: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  partsSummaryList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  partSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  partSummaryTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  partSummarySku: {
    fontSize: 10,
    color: colors.textMuted,
  },
  partSummaryPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  taxNotice: {
    marginTop: 6,
    padding: 6,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
  },
  taxNoticeText: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  totalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.accent,
  },
  errorBanner: {
    backgroundColor: '#7F1D1D',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 12,
    color: '#FECACA',
    lineHeight: 16,
  },
  payButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
});
