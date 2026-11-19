import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ORDER_ISSUE_OPTIONS,
  orderIssueService,
  type OrderIssueType,
} from '../services/order-issue.service';
import { borderRadius, colors, spacing } from '../theme/index';

interface OrderIssueModalProps {
  readonly visible: boolean;
  readonly orderReference: string;
  readonly accessToken: string;
  readonly onClose: () => void;
}

export function OrderIssueModal({
  visible,
  orderReference,
  accessToken,
  onClose,
}: OrderIssueModalProps) {
  const [selectedType, setSelectedType] = useState<OrderIssueType>('DEFECTIVE_PART');
  const [description, setDescription] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  const handleClose = () => {
    setErrorMsg(null);
    setSubmittedTicketId(null);
    setDescription('');
    setContactPhone('');
    onClose();
  };

  const handleSubmit = async () => {
    const cleanDesc = description.trim();
    if (cleanDesc.length < 10) {
      setErrorMsg('Describe brevemente el problema o motivo de devolución (mínimo 10 caracteres).');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await orderIssueService.reportIssue({
        accessToken,
        issueType: selectedType,
        description: cleanDesc,
        contactPhone: contactPhone.trim() || undefined,
      });
      setSubmittedTicketId(res.issueId);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo enviar tu solicitud. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Reportar problema o devolución</Text>
              <Text style={styles.subtitle}>Pedido {orderReference}</Text>
            </View>
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar formulario de incidencia"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {submittedTicketId ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={44} color="#16A34A" />
              <Text style={styles.successTitle}>Incidencia registrada</Text>
              <Text style={styles.successBody}>
                Hemos adjuntado los datos de tu pedido {orderReference} y notificado a nuestro equipo de soporte. Te contactaremos en menos de 24 h laborables.
              </Text>
              <Text style={styles.ticketRef}>Código de caso: {submittedTicketId.slice(0, 8).toUpperCase()}</Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Entendido</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formBody}>
              <Text style={styles.sectionLabel}>Motivo</Text>
              <View style={styles.optionsList}>
                {ORDER_ISSUE_OPTIONS.map((opt) => {
                  const active = selectedType === opt.type;
                  return (
                    <Pressable
                      key={opt.type}
                      style={[styles.optionCard, active && styles.optionCardActive]}
                      onPress={() => setSelectedType(opt.type)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.optionHelper}>{opt.helper}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Cuéntanos qué ha ocurrido *</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Indica detalles de la pieza, defecto detectado o si necesitas gestionar la recogida..."
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
              />

              <Text style={styles.sectionLabel}>Teléfono de contacto (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 612 345 678"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={contactPhone}
                onChangeText={setContactPhone}
                maxLength={40}
              />

              {Boolean(errorMsg) && <Text style={styles.errorText}>{errorMsg}</Text>}

              <Pressable
                style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityRole="button"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryBtnText}>Enviar solicitud de soporte</Text>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 12, 15, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 28 : spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  formBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  optionsList: {
    gap: spacing.xs + 2,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    backgroundColor: colors.background,
  },
  optionCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  optionLabelActive: {
    color: colors.accent,
  },
  optionHelper: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    minHeight: 96,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  successBox: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successBody: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  ticketRef: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
});
