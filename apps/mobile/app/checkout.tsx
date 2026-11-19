import { router } from 'expo-router';
import type { Href } from 'expo-router';
import React, { useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { initStripe, useStripe } from '../services/stripe-client';
import { formatMoneyWithVat, quoteShipping, shippingFailureMessage, vatCents } from '@mobile-marketplace/core';
import { useCart } from '../services/cart-context';
import { AsyncStorageCartStorage } from '../services/cart-storage';
import { buildOrderHref } from '../services/order-link';
import { rememberOrderInHistory, rememberPendingOrder } from '../services/pending-orders.service';
import { CheckoutError, checkoutService } from '../services/checkout.service';
import type { CheckoutPricingResponse } from '../services/checkout.service';
import {
  computeCheckoutFingerprint,
  createInitialAttemptState,
  planCheckoutAttempt,
  recordOrderCreated,
  resetAttempt,
  shouldResetAttempt,
} from '../services/checkout-attempt';
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Idempotency bookkeeping: retrying with the same data resumes the same order and
  // PaymentIntent; changed data starts a new order and releases the previous one.
  const attemptRef = useRef(createInitialAttemptState());
  // Synchronous guard: React state alone lets two taps in the same frame both submit.
  const submittingRef = useRef(false);

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

  // The server is the pricing authority (it recomputes from the live catalog). Until it
  // answers, the breakdown is an estimate from the cart snapshot; once it answers, the
  // screen shows exactly what will be charged.
  // Shipping depends on the postal code, so a confirmed price only holds for the same
  // parts AND the same postal code.
  const cartKey = useMemo(
    () => `${activeItems.map((i) => i.part.id).sort().join(',')}|${postalCode.trim()}`,
    [activeItems, postalCode]
  );
  const [confirmedPricing, setConfirmedPricing] = useState<{ cartKey: string; pricing: CheckoutPricingResponse } | null>(null);
  const serverPricing = confirmedPricing?.cartKey === cartKey ? confirmedPricing.pricing : null;

  // Shipping by total weight and destination zone, same table the server applies.
  const postalCodeComplete = /^\d{5}$/.test(postalCode.trim());
  const shippingEstimate = useMemo(
    () => quoteShipping(postalCode, activeItems.map((i) => i.part.weightGrams)),
    [postalCode, activeItems]
  );
  const estimatedShippingCents = shippingEstimate.ok ? shippingEstimate.shippingCents : null;
  const displaySubtotalCents = serverPricing?.subtotalCents ?? subtotalCents;
  const shippingCents: number | null = serverPricing?.shippingCents ?? estimatedShippingCents;
  const estimatedTaxCents = vatCents(subtotalCents + (estimatedShippingCents ?? 0));
  const taxCents = serverPricing?.taxCents ?? estimatedTaxCents;
  const totalCents = serverPricing?.totalCents ?? subtotalCents + (estimatedShippingCents ?? 0) + estimatedTaxCents;
  // The cart may hold parts saved before weights existed: only a zone we do not ship to is
  // certain on the device. Anything else is left for the server to decide.
  const shippingNote = serverPricing
    ? null
    : !postalCodeComplete
      ? 'Indica el código postal para calcular el envío.'
      : shippingEstimate.ok
        ? null
        : shippingEstimate.reason === 'WEIGHT_UNKNOWN'
          ? 'El envío se calcula al pulsar "Pagar".'
          : shippingFailureMessage(shippingEstimate);
  const isTestOrder = serverPricing?.isTestOrder ?? process.env.EXPO_PUBLIC_CHECKOUT_TEST_MODE !== 'false';
  const formatCents = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} EUR`;

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

    if (!shippingEstimate.ok && shippingEstimate.reason === 'ZONE_NOT_SERVED') {
      setErrorMessage(shippingFailureMessage(shippingEstimate));
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

    if (!termsAccepted) {
      setErrorMessage('Debes aceptar las Condiciones de compra y la Política de devoluciones antes de pagar.');
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

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    const partIds = activeItems.map((i) => i.part.id);
    // orderedPartIds: cart items the order screen removes once the backend confirms payment.
    const goToOrder = (reference: string, token: string, orderedPartIds: readonly string[] = partIds) =>
      router.replace(buildOrderHref({ reference, accessToken: token, orderedPartIds }, Platform.OS) as Href);

    try {
      const contact = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        customerPhone: customerPhone.trim(),
      };
      const address = {
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim(),
        country: 'ES' as const,
      };
      const plan = planCheckoutAttempt(
        attemptRef.current,
        computeCheckoutFingerprint({ contact, address, partIds })
      );
      attemptRef.current = plan.state;

      // 1. Server-side order creation (or resumption) & PaymentIntent
      const res = await checkoutService.createPaymentIntent({
        contact,
        address,
        partIds,
        idempotencyKey: plan.idempotencyKey,
        previousOrderAccessToken: plan.previousOrderAccessToken,
      });
      attemptRef.current = recordOrderCreated(attemptRef.current, res.accessToken);

      // This attempt was already paid (e.g. the first response was lost): show the order.
      if (!res.clientSecret && res.status !== 'PENDING_PAYMENT') {
        await rememberOrderInHistory(new AsyncStorageCartStorage(), {
          reference: res.orderReference,
          accessToken: res.accessToken,
          partIds,
        });
        goToOrder(res.orderReference, res.accessToken);
        return;
      }

      // Never charge an amount the buyer has not seen: if the server total differs from the
      // one on screen, show the real breakdown and ask for a second, informed tap.
      if (res.pricing && res.pricing.totalCents !== totalCents) {
        setConfirmedPricing({ cartKey, pricing: res.pricing });
        setErrorMessage(
          `El total se ha actualizado a ${formatCents(res.pricing.totalCents)} según el precio actual del catálogo. Revisa el desglose y pulsa "Pagar" de nuevo para confirmar.`
        );
        submittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
      if (res.pricing) {
        setConfirmedPricing({ cartKey, pricing: res.pricing });
      }

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
          merchantIdentifier: 'merchant.com.buscapiezas24h.recambios',
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
          // Customer cancelled payment sheet; preserve cart and form. Paying again with
          // the same data resumes this same order and PaymentIntent.
          submittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // 4. PaymentSheet returned success -> Redirect to order tracking screen
      // The order screen checks backend authority before clearing the cart.
      await rememberPendingOrder(new AsyncStorageCartStorage(), {
        reference: res.orderReference,
        accessToken: res.accessToken,
        partIds,
      });
      goToOrder(res.orderReference, res.accessToken);
    } catch (err: any) {
      if (err instanceof CheckoutError) {
        const details = err.errorDetails as { orderReference?: string; accessToken?: string } | undefined;
        if (err.errorCode === 'PREVIOUS_ORDER_ALREADY_PAID' && details?.orderReference && details.accessToken) {
          // Its parts are unknown here, so the cart is left untouched.
          goToOrder(details.orderReference, details.accessToken, []);
          return;
        }
        if (shouldResetAttempt(err.errorCode)) {
          attemptRef.current = resetAttempt(attemptRef.current);
        }
      }
      setErrorMessage(err?.message || 'Error procesando el pago. Tu carrito se mantiene intacto.');
      submittingRef.current = false;
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
        <View style={[styles.stagingBanner, !isTestOrder && { display: 'none' }]}>
          <View style={styles.badgeStaging}>
            <Text style={styles.badgeStagingText}>MODO PRUEBAS · STAGING</Text>
          </View>
          <Text style={styles.stagingBannerTitle}>Entorno de simulación de pagos Stripe Connect</Text>
          <Text style={styles.stagingBannerText}>
            No se realizarán cobros reales en tu tarjeta bancaria. Los precios llevan el 21 % de IVA añadido y los portes se calculan con la tarifa del desguace según el peso del pedido y la zona de entrega.
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
                <Text style={styles.partSummaryPrice}>{formatMoneyWithVat(item.part.price)}</Text>
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
            <Text style={styles.breakdownLabel}>Recambios sin IVA ({activeItems.length})</Text>
            <Text style={styles.breakdownValue}>{formatCents(displaySubtotalCents)}</Text>
          </View>

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>
              Gastos de envío sin IVA
              {shippingEstimate.ok && !serverPricing ? ` (${(shippingEstimate.totalWeightGrams / 1000).toFixed(1).replace('.', ',')} kg)` : ''}
            </Text>
            <Text style={styles.breakdownValue}>{shippingCents === null ? '—' : formatCents(shippingCents)}</Text>
          </View>
          {Boolean(shippingNote) && (
            <View style={styles.taxNotice}>
              <Text style={styles.taxNoticeText}>{shippingNote}</Text>
            </View>
          )}

          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>IVA (21 %)</Text>
            <Text style={[styles.breakdownValue, { color: colors.warning }]}>{formatCents(taxCents)}</Text>
          </View>

          <View style={styles.totalDivider} />

          <View style={styles.breakdownRow}>
            <Text style={styles.totalLabel}>
              {serverPricing ? 'Total a pagar' : shippingCents === null ? 'Total sin envío' : 'Total estimado'}
              {isTestOrder ? ' (pruebas)' : ''}
            </Text>
            <Text style={styles.totalValue}>{formatCents(totalCents)}</Text>
          </View>
        </View>

        {/* Error Banner */}
        {Boolean(errorMessage) && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <View style={styles.legalAcceptanceRow}>
          <Switch
            value={termsAccepted}
            onValueChange={setTermsAccepted}
            disabled={isSubmitting}
            trackColor={{ false: colors.borderStrong, true: colors.accent }}
            accessibilityLabel="Aceptar condiciones de compra y política de devoluciones"
          />
          <Text style={styles.legalAcceptance}>
            He leído y acepto las{' '}
            <Text style={styles.legalLink} accessibilityRole="link" onPress={() => router.push('/legal/condiciones' as Href)}>
              Condiciones de compra
            </Text>{' '}
            y la{' '}
            <Text style={styles.legalLink} accessibilityRole="link" onPress={() => router.push('/legal/devoluciones' as Href)}>
              Política de devoluciones y garantía
            </Text>{' '}
            (desistimiento de 14 días), y he sido informado de la{' '}
            <Text style={styles.legalLink} accessibilityRole="link" onPress={() => router.push('/legal/privacidad' as Href)}>
              Política de privacidad
            </Text>
            .
          </Text>
        </View>

        {/* Pay Button */}
        <Pressable
          style={[styles.payButton, (isSubmitting || !termsAccepted) && styles.payButtonDisabled]}
          onPress={handlePay}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={
            isTestOrder
              ? `Pagar ${formatCents(totalCents)} con Stripe en modo pruebas`
              : `Pagar ${formatCents(totalCents)} y confirmar pedido con obligación de pago`
          }
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.payButtonText}>
              {isTestOrder
                ? `Pagar ${formatCents(totalCents)} (Modo Pruebas)`
                : `Pagar ${formatCents(totalCents)} · Confirmar pedido`}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  legalAcceptanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legalAcceptance: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  legalLink: {
    color: colors.textPrimary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
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
