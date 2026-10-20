import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Part, Vendor } from '@mobile-marketplace/core';
import { formatMoney } from '@mobile-marketplace/core';
import { borderRadius, colors, spacing, typography } from '../theme/index';

interface Props {
  readonly visible: boolean;
  readonly part: Part;
  readonly vendor: Vendor;
  readonly onClose: () => void;
}

export function InquiryModal({ visible, part, vendor, onClose }: Props) {
  const [buyerName, setBuyerName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [vinOrQuestion, setVinOrQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!buyerName.trim() || !contactInfo.trim()) {
      Alert.alert('Datos requeridos', 'Por favor, indica tu nombre y un teléfono o email de contacto.');
      return;
    }

    setSubmitted(true);
  };

  const handleResetAndClose = () => {
    setSubmitted(false);
    setBuyerName('');
    setContactInfo('');
    setVinOrQuestion('');
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
              <Pressable onPress={handleResetAndClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Part summary */}
            <View style={styles.partSummary}>
              <Text style={styles.partTitle} numberOfLines={2}>{part.title}</Text>
              <Text style={styles.partPrice}>{formatMoney(part.price)} · IVA incl.</Text>
              <Text style={styles.vendorNotice}>
                Gestionado por {vendor.tradeName} ({vendor.catAuthorizationCode})
              </Text>
            </View>

            {submitted ? (
              <View style={styles.confirmationBox}>
                <Text style={styles.confirmTitle}>Solicitud de consulta registrada</Text>
                <Text style={styles.confirmText}>
                  [Modo prueba / Prototipo]: Los datos para consultar la pieza #{part.source.externalPartId} ({vendor.tradeName}) se han registrado localmente en la interfaz.
                </Text>
                <Text style={styles.confirmNote}>
                  Aviso: En esta fase de staging no se realiza envío telemático externo al CAT ni se bloquea stock físico.
                </Text>

                <Pressable style={styles.confirmBtn} onPress={handleResetAndClose}>
                  <Text style={styles.confirmBtnText}>Cerrar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.disclaimerText}>
                  No cobramos nada por adelantado. El desguace verificará que la pieza sigue en almacén y resolverá tus dudas técnicas.
                </Text>

                <Text style={styles.inputLabel}>Tu nombre *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Carlos Martínez"
                  placeholderTextColor={colors.textMuted}
                  value={buyerName}
                  onChangeText={setBuyerName}
                />

                <Text style={styles.inputLabel}>Teléfono o Correo electrónico *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. 612 345 678 o carlos@email.com"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={contactInfo}
                  onChangeText={setContactInfo}
                />

                <Text style={styles.inputLabel}>
                  Bastidor (VIN) o consulta sobre la pieza (opcional)
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Si tienes dudas de compatibilidad, añade tu bastidor o pregunta si incluye cableado, tornillería, etc."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  value={vinOrQuestion}
                  onChangeText={setVinOrQuestion}
                />

                <Pressable style={styles.submitBtn} onPress={handleSubmit}>
                  <Text style={styles.submitBtnText}>Enviar consulta al desguace</Text>
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
    height: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
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
});
