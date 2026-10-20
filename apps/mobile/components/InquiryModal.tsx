import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Part, SubmitInquiryResponse, Vendor } from '@mobile-marketplace/core';
import { formatMoney } from '@mobile-marketplace/core';
import { inquiryService } from '../services/inquiry.service';
import { borderRadius, colors, spacing, typography } from '../theme/index';

function generateClientUuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  if (c && c.randomUUID) {
    return c.randomUUID();
  }
  return 'idemp-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
}

interface Props {
  readonly visible: boolean;
  readonly part: Part;
  readonly vendor: Vendor;
  readonly onClose: () => void;
}

export function InquiryModal({ visible, part, vendor, onClose }: Props) {
  const [buyerName, setBuyerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [vehicleIdentifier, setVehicleIdentifier] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitInquiryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!buyerName.trim()) {
      Alert.alert('Nombre requerido', 'Por favor, introduce tu nombre completo.');
      return;
    }

    if (!phone.trim() && !email.trim()) {
      Alert.alert(
        'Contacto requerido',
        'Por favor, introduce al menos un medio de contacto: teléfono o correo electrónico.'
      );
      return;
    }

    if (!privacyAccepted) {
      Alert.alert(
        'Aviso de privacidad requerido',
        'Debes aceptar el tratamiento de datos para tramitar la consulta comercial.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await inquiryService.submitInquiry({
        customerName: buyerName.trim(),
        customerPhone: phone.trim() ? phone.trim() : undefined,
        customerEmail: email.trim() ? email.trim() : undefined,
        customerMessage: message.trim() ? message.trim() : undefined,
        vehiclePlate: vehicleIdentifier.trim() ? vehicleIdentifier.trim() : undefined,
        items: [
          {
            partId: part.id,
          },
        ],
        privacyConsent: {
          accepted: true,
          version: 'v1.0',
        },
        idempotencyKey: generateClientUuid(),
      });

      setSubmitResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con el servidor de consultas.';
      setErrorMessage(msg);
      Alert.alert('No se pudo enviar la consulta', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmitResult(null);
    setErrorMessage(null);
    setBuyerName('');
    setPhone('');
    setEmail('');
    setMessage('');
    setVehicleIdentifier('');
    setPrivacyAccepted(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Consultar disponibilidad</Text>
              <Pressable onPress={handleResetAndClose} style={styles.closeBtn} disabled={isSubmitting}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Part summary */}
            <View style={styles.partSummary}>
              <Text style={styles.partTitle} numberOfLines={2}>{part.title}</Text>
              <Text style={styles.partPrice}>{formatMoney(part.price)} · Impuestos/portes por confirmar</Text>
              <Text style={styles.vendorNotice}>
                Gestionado por {vendor.tradeName} ({vendor.catAuthorizationCode})
              </Text>
            </View>

            {submitResult ? (
              <View style={styles.confirmationBox}>
                <Text style={styles.confirmTitle}>Consulta registrada en el sistema</Text>

                <View style={styles.refContainer}>
                  <Text style={styles.refLabel}>Referencia de consulta:</Text>
                  <Text style={styles.refCode}>
                    {submitResult.inquiries[0]?.inquiryReference ?? submitResult.groupId}
                  </Text>
                </View>

                {submitResult.inquiries[0]?.notificationStatus === 'SENT' ? (
                  <View style={styles.statusSuccessBanner}>
                    <Text style={styles.statusSuccessText}>
                      Notificación enviada al buzón del desguace.
                    </Text>
                  </View>
                ) : submitResult.inquiries[0]?.notificationStatus === 'SKIPPED_NOT_CONFIGURED' ? (
                  <View style={styles.statusWarningBanner}>
                    <Text style={styles.statusWarningText}>
                      Consulta registrada. Notificación telemática pendiente de activación en entorno de pruebas.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.statusPendingBanner}>
                    <Text style={styles.statusPendingText}>
                      Consulta guardada en servidor. Notificación telemática en cola de envío.
                    </Text>
                  </View>
                )}

                <Text style={styles.confirmText}>
                  La solicitud para la pieza #{part.source.externalPartId} ha sido recibida por el backend del marketplace.
                </Text>

                <Text style={styles.confirmNote}>
                  Aviso comercial: El desguace verificará la existencia física de la pieza, su estado técnico y los costes exactos de embalaje y envío antes de formalizar cualquier venta. La pieza no queda reservada.
                </Text>

                <Pressable style={styles.confirmBtn} onPress={handleResetAndClose}>
                  <Text style={styles.confirmBtnText}>Entendido</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.disclaimerText}>
                  La pieza figura en el catálogo publicado. La existencia física real, impuestos aplicables y gastos de transporte deben confirmarse directamente con el desguace antes de realizar cualquier pago.
                </Text>

                {errorMessage ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>Tu nombre completo *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Carlos Martínez"
                  placeholderTextColor={colors.textMuted}
                  value={buyerName}
                  onChangeText={setBuyerName}
                  editable={!isSubmitting}
                />

                <Text style={styles.inputLabel}>Teléfono móvil</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. 612 345 678"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  editable={!isSubmitting}
                />

                <Text style={styles.inputLabel}>Correo electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. carlos@ejemplo.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  editable={!isSubmitting}
                />
                <Text style={styles.helperText}>
                  * Indica al menos un canal de contacto válido (teléfono o email).
                </Text>

                <Text style={styles.inputLabel}>Pregunta o comentario (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Ej. ¿Incluye cables/conectores? ¿Tiene desperfectos visibles?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={message}
                  onChangeText={setMessage}
                  editable={!isSubmitting}
                />

                <Text style={styles.inputLabel}>Matrícula o Bastidor VIN (opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Para que el desguace compruebe compatibilidad técnica exacta"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  value={vehicleIdentifier}
                  onChangeText={setVehicleIdentifier}
                  editable={!isSubmitting}
                />

                <View style={styles.consentRow}>
                  <Switch
                    value={privacyAccepted}
                    onValueChange={setPrivacyAccepted}
                    disabled={isSubmitting}
                    trackColor={{ false: colors.borderStrong, true: colors.accent }}
                  />
                  <Text style={styles.consentText}>
                    Acepto que mis datos de contacto sean remitidos al desguace responsable de la pieza para gestionar esta consulta de disponibilidad (Aviso 2026-v1).
                  </Text>
                </View>

                <Pressable
                  style={[styles.submitBtn, (!privacyAccepted || isSubmitting) && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!privacyAccepted || isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Text style={styles.submitBtnText}>Enviar consulta al desguace</Text>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.lg * 1.5,
    borderTopRightRadius: borderRadius.lg * 1.5,
    maxHeight: '90%',
  },
  scrollContent: {
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.titleMedium,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  partSummary: {
    backgroundColor: colors.cardSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  partTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  partPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 2,
  },
  vendorNotice: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  form: {
    marginTop: spacing.xs,
  },
  disclaimerText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  textArea: {
    height: 72,
    textAlignVertical: 'top',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 15,
  },
  confirmationBox: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.verified,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  refContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  refLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  refCode: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  statusSuccessBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderColor: colors.verified,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  statusSuccessText: {
    fontSize: 12,
    color: colors.verified,
    textAlign: 'center',
    fontWeight: '600',
  },
  statusWarningBanner: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  statusWarningText: {
    fontSize: 12,
    color: colors.warning,
    textAlign: 'center',
    fontWeight: '600',
  },
  statusPendingBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  statusPendingText: {
    fontSize: 12,
    color: colors.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
  confirmText: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  confirmNote: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.md,
  },
  confirmBtnText: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
  },
});
