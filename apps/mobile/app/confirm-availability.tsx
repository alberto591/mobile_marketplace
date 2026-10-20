import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SubmitInquiryResponse } from '@mobile-marketplace/core';
import { formatMoney } from '@mobile-marketplace/core';
import { useCart } from '../services/cart-context';
import { inquiryService } from '../services/inquiry.service';
import { borderRadius, colors, spacing, typography } from '../theme/index';

function generateClientUuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  if (c && c.randomUUID) {
    return c.randomUUID();
  }
  return 'idemp-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

export default function ConfirmAvailabilityScreen() {
  const { items, itemCount, subtotal, vendorGroups, clearCart } = useCart();

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [vehicleVin, setVehicleVin] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<SubmitInquiryResponse | null>(null);

  // Preserve idempotency key per form session
  const idempotencyKey = useMemo(() => generateClientUuid(), []);

  const handleSubmit = async () => {
    setSubmitError(null);

    const cleanName = customerName.trim();
    const cleanEmail = customerEmail.trim();
    const cleanPhone = customerPhone.trim();

    if (!cleanName || cleanName.length < 2) {
      Alert.alert('Nombre requerido', 'Por favor, indica tu nombre completo (mínimo 2 caracteres).');
      return;
    }

    if (!cleanEmail && !cleanPhone) {
      Alert.alert(
        'Medio de contacto requerido',
        'Por favor, facilita al menos un medio de contacto (teléfono o correo electrónico) para que el desguace pueda responderte.'
      );
      return;
    }

    if (!privacyAccepted) {
      Alert.alert(
        'Aviso de privacidad requerido',
        'Debes aceptar el aviso de privacidad para tramitar la consulta con el desguace colaborador.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await inquiryService.submitInquiry({
        customerName: cleanName,
        customerEmail: cleanEmail || undefined,
        customerPhone: cleanPhone || undefined,
        customerMessage: customerMessage.trim() || undefined,
        vehicleVin: vehicleVin.trim() || undefined,
        vehiclePlate: vehiclePlate.trim() || undefined,
        items: items.map((it) => ({ partId: it.part.id })),
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
        idempotencyKey,
      });

      setSubmissionResult(response);
    } catch (err: any) {
      setSubmitError(err?.message || 'Error al conectar con el servidor para registrar la consulta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = (clearSelection: boolean) => {
    if (clearSelection) {
      clearCart();
    }
    router.replace('/');
  };

  if (itemCount === 0 && !submissionResult) {
    return (
      <View style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.emptyTitle}>No hay piezas en el carrito</Text>
          <Text style={styles.emptyText}>
            Selecciona recambios en el catálogo antes de solicitar confirmación de disponibilidad.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={styles.primaryBtnText}>Volver al catálogo</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {submissionResult ? (
          <View style={styles.confirmedBox}>
            <View style={styles.confirmedBadge}>
              <Text style={styles.confirmedBadgeText}>Consulta Registrada en Servidor</Text>
            </View>

            <Text style={styles.confirmedHeading}>
              Solicitud recibida correctamente
            </Text>

            <Text style={styles.confirmedSub}>
              Tu consulta comercial ha sido registrada en el sistema central y asignada a cada desguace colaborador.
            </Text>

            {/* Inquiries by vendor summary */}
            <View style={styles.referencesCard}>
              <Text style={styles.referencesCardTitle}>Referencias de seguimiento:</Text>
              {submissionResult.inquiries.map((inq) => {
                const isSent = inq.notificationStatus === 'SENT';
                const isFailed = inq.notificationStatus === 'FAILED';
                const isSkipped = inq.notificationStatus === 'SKIPPED_NOT_CONFIGURED';

                let badgeLabel = 'En cola de notificación';
                let badgeStyle = styles.badgePending;
                if (isSent) {
                  badgeLabel = 'Notificación enviada por email al desguace';
                  badgeStyle = styles.badgeSent;
                } else if (isFailed) {
                  badgeLabel = 'Registrada (notificación pendiente de reintento)';
                  badgeStyle = styles.badgeFailed;
                } else if (isSkipped) {
                  badgeLabel = 'Registrada en backend (pendiente config. comercial)';
                  badgeStyle = styles.badgePending;
                }

                return (
                  <View key={inq.inquiryId} style={styles.referenceRow}>
                    <View style={styles.referenceHeader}>
                      <Text style={styles.vendorTitle}>{inq.vendorTradeName}</Text>
                      <Text style={styles.refCode}>{inq.inquiryReference}</Text>
                    </View>
                    <View style={[styles.statusPill, badgeStyle]}>
                      <Text style={styles.statusPillText}>{badgeLabel}</Text>
                    </View>
                    <Text style={styles.refItemCount}>
                      {inq.itemCount} {inq.itemCount === 1 ? 'pieza consultada' : 'piezas consultadas'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.disclaimerWarningBox}>
              <Text style={styles.disclaimerWarningTitle}>
                Siguientes pasos e información comercial
              </Text>
              <Text style={styles.disclaimerWarningBody}>
                1. El personal del CAT verificará la existencia física en estantería y el estado del recambio.
              </Text>
              <Text style={styles.disclaimerWarningBody}>
                2. Te contactarán directamente al teléfono ({customerPhone || 'no indicado'}) o correo ({customerEmail || 'no indicado'}) para indicarte el importe definitivo con transporte y las formas de pago del centro.
              </Text>
              <Text style={styles.disclaimerWarningBody}>
                3. Recuerda que no se ha realizado ninguna reserva de material ni cargo en tarjeta.
              </Text>
            </View>

            <View style={styles.actionButtonsRow}>
              <Pressable
                style={[styles.primaryBtn, { flex: 1, marginRight: spacing.xs }]}
                onPress={() => handleFinish(true)}
              >
                <Text style={styles.primaryBtnText}>Vaciar carrito e ir a Inicio</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, { flex: 1 }]}
                onPress={() => handleFinish(false)}
              >
                <Text style={styles.secondaryBtnText}>Mantener carrito e ir a Inicio</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
            {/* Warning Card: Stock Not Reserved */}
            <View style={styles.warningCard}>
              <Text style={styles.warningCardTitle}>
                Atención: Las piezas no quedan reservadas
              </Text>
              <Text style={styles.warningCardBody}>
                Los recambios figuran como disponibles en el catálogo remitido periódicamente por cada desguace. La existencia física real en estantería, el estado del material y los costes de transporte deben ser verificados directamente con el CAT antes de tramitar cualquier pago.
              </Text>
              <Text style={styles.warningCardFootnote}>
                Precio publicado por el desguace. Impuestos aplicables y gastos de transporte por confirmar. No se solicitarán tarjetas ni pagos en esta app.
              </Text>
            </View>

            {/* Selection Summary */}
            <View style={styles.selectionCard}>
              <Text style={styles.sectionHeading}>Piezas a consultar ({itemCount})</Text>

              {vendorGroups.map((group) => (
                <View key={group.vendorId} style={styles.vendorGroupSummary}>
                  <Text style={styles.groupVendorName}>{group.vendor.tradeName}</Text>
                  {group.items.map((item) => (
                    <View key={item.part.id} style={styles.miniItemRow}>
                      <Text style={styles.miniItemTitle} numberOfLines={1}>
                        {item.part.title}
                      </Text>
                      <Text style={styles.miniItemPrice}>
                        {formatMoney(item.part.price)}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.groupSubtotalText}>
                    Subtotal {group.vendor.tradeName}: {formatMoney(group.subtotal)}
                  </Text>
                </View>
              ))}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal piezas (precio publicado):</Text>
                <Text style={styles.totalAmount}>{formatMoney(subtotal)}</Text>
              </View>
              <Text style={styles.provisionalNote}>
                * Subtotal provisional sobre precios publicados por el desguace. Impuestos aplicables y gastos de transporte por confirmar con cada centro.
              </Text>
            </View>

            {/* Error banner if submit failed */}
            {submitError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Error al enviar la consulta</Text>
                <Text style={styles.errorBody}>{submitError}</Text>
              </View>
            ) : null}

            {/* Contact Form */}
            <View style={styles.formCard}>
              <Text style={styles.sectionHeading}>Datos de contacto y consulta</Text>
              <Text style={styles.formHint}>
                El desguace utilizará estos datos para responderte directamente e informarte sobre disponibilidad y transporte.
              </Text>

              <Text style={styles.label}>Tu nombre y apellidos *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor={colors.textMuted}
                value={customerName}
                onChangeText={setCustomerName}
                editable={!isSubmitting}
              />

              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. juan@ejemplo.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerEmail}
                onChangeText={setCustomerEmail}
                editable={!isSubmitting}
              />

              <Text style={styles.label}>Teléfono de contacto</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 612 345 678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                editable={!isSubmitting}
              />
              <Text style={styles.fieldNote}>
                * Indica al menos un teléfono o correo electrónico para recibir respuesta.
              </Text>

              <Text style={styles.label}>Número de bastidor (VIN) (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Recomendado para comprobar compatibilidad exacta en CAT"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                value={vehicleVin}
                onChangeText={setVehicleVin}
                editable={!isSubmitting}
              />

              <Text style={styles.label}>Matrícula del vehículo (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 1234XYZ"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                editable={!isSubmitting}
              />

              <Text style={styles.label}>Observaciones o dudas técnicas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Indica cualquier detalle sobre entrega, código de motor o consulta técnica"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={customerMessage}
                onChangeText={setCustomerMessage}
                editable={!isSubmitting}
              />

              {/* Privacy Consent Checkbox */}
              <View style={styles.privacyRow}>
                <Switch
                  value={privacyAccepted}
                  onValueChange={setPrivacyAccepted}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.card}
                  disabled={isSubmitting}
                />
                <Text style={styles.privacyText}>
                  He leído y acepto el{' '}
                  <Text style={styles.privacyLink}>aviso de privacidad</Text> para la tramitación de esta consulta comercial con los Centros CAT colaboradores.
                </Text>
              </View>

              <Pressable
                style={[
                  styles.submitBtn,
                  (!privacyAccepted || isSubmitting) && styles.submitBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!privacyAccepted || isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Enviar consulta comercial de disponibilidad"
              >
                {isSubmitting ? (
                  <View style={styles.submittingRow}>
                    <ActivityIndicator size="small" color={colors.textInverse} />
                    <Text style={styles.submitBtnText}>Enviando consulta al backend...</Text>
                  </View>
                ) : (
                  <Text style={styles.submitBtnText}>
                    Enviar consulta de disponibilidad
                  </Text>
                )}
              </Pressable>

              <Text style={styles.submitNotice}>
                La consulta se enviará de forma segura al desguace. No se realiza ningún cobro ni reserva automática de stock.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 60,
  },
  container: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  warningCard: {
    backgroundColor: colors.warningBg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  warningCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.warning,
    marginBottom: 4,
  },
  warningCardBody: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 6,
  },
  warningCardFootnote: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  selectionCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vendorGroupSummary: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupVendorName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  miniItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  miniItemTitle: {
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  miniItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  groupSubtotalText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  totalAmount: {
    ...typography.price,
    color: colors.textPrimary,
  },
  provisionalNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 12,
    color: '#b91c1c',
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  fieldNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.textPrimary,
  },
  textArea: {
    height: 70,
    textAlignVertical: 'top',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  privacyText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 18,
  },
  privacyLink: {
    color: colors.accent,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: {
    backgroundColor: colors.textMuted,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 15,
  },
  submitNotice: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  secondaryBtn: {
    backgroundColor: colors.cardSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  confirmedBox: {
    padding: spacing.md,
  },
  confirmedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  confirmedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  confirmedHeading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  confirmedSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  referencesCard: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  referencesCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  referenceRow: {
    backgroundColor: colors.background,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  referenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  vendorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  refCode: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
    backgroundColor: colors.cardSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginVertical: 4,
  },
  badgeSent: {
    backgroundColor: '#dcfce7',
  },
  badgePending: {
    backgroundColor: '#fef3c7',
  },
  badgeFailed: {
    backgroundColor: '#fee2e2',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  refItemCount: {
    fontSize: 11,
    color: colors.textMuted,
  },
  disclaimerWarningBox: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  disclaimerWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  disclaimerWarningBody: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});
