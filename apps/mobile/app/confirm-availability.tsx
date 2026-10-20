import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatMoney } from '@mobile-marketplace/core';
import { useCart } from '../services/cart-context';
import { borderRadius, colors, spacing, typography } from '../theme/index';

export default function ConfirmAvailabilityScreen() {
  const { items, itemCount, subtotal, vendorGroups, clearCart } = useCart();

  const [buyerName, setBuyerName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [vehicleVin, setVehicleVin] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!buyerName.trim() || !contactInfo.trim()) {
      Alert.alert(
        'Datos de contacto requeridos',
        'Por favor, indica tu nombre y un teléfono o correo electrónico para que el desguace pueda responderte.'
      );
      return;
    }

    setSubmitted(true);
  };

  const handleFinish = (clearSelection: boolean) => {
    if (clearSelection) {
      clearCart();
    }
    router.replace('/');
  };

  if (itemCount === 0 && !submitted) {
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
        {submitted ? (
          <View style={styles.confirmedBox}>
            <View style={styles.confirmedBadge}>
              <Text style={styles.confirmedBadgeText}>Consulta Guardada Localmente</Text>
            </View>

            <Text style={styles.confirmedHeading}>
              Consulta registrada en el dispositivo
            </Text>

            <View style={styles.disclaimerWarningBox}>
              <Text style={styles.disclaimerWarningTitle}>
                Aviso importante sobre el estado de la integración
              </Text>
              <Text style={styles.disclaimerWarningBody}>
                La API de los desguaces colaboradores es exclusivamente de solo lectura (catálogo público de inventario sin servicio de reserva telemática ni compraventa).
              </Text>
              <Text style={styles.disclaimerWarningBody}>
                Esta solicitud NO se ha enviado al desguace y las piezas NO quedan reservadas. Los datos han quedado guardados localmente en tu dispositivo para que puedas contactar directamente con el centro con las referencias exactas preparadas.
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryHeading}>Resumen de la consulta:</Text>
              <Text style={styles.summaryRowText}>
                Interesado: <Text style={styles.bold}>{buyerName}</Text> ({contactInfo})
              </Text>
              {vehicleVin ? (
                <Text style={styles.summaryRowText}>
                  Vehículo / Bastidor: <Text style={styles.bold}>{vehicleVin}</Text>
                </Text>
              ) : null}
              <Text style={styles.summaryRowText}>
                Artículos: <Text style={styles.bold}>{itemCount} piezas</Text>
              </Text>
              <Text style={styles.summaryRowText}>
                Subtotal provisional: <Text style={styles.bold}>{formatMoney(subtotal)}</Text>
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
                Las piezas figuran como disponibles en el catálogo remitido periódicamente por cada desguace. La existencia física real en estantería, el estado del material y los costes de transporte deben ser verificados directamente con el CAT antes de tramitar cualquier pago.
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

            {/* Contact Form */}
            <View style={styles.formCard}>
              <Text style={styles.sectionHeading}>Datos para la comprobación</Text>
              <Text style={styles.formHint}>
                Estos datos se guardarán localmente en tu dispositivo como borrador de consulta para facilitar el contacto con el centro.
              </Text>

              <Text style={styles.label}>Tu nombre y apellidos *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. Juan Pérez"
                placeholderTextColor={colors.textMuted}
                value={buyerName}
                onChangeText={setBuyerName}
              />

              <Text style={styles.label}>Teléfono o Correo electrónico *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej. 612 345 678 o juan@ejemplo.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={contactInfo}
                onChangeText={setContactInfo}
              />

              <Text style={styles.label}>Número de bastidor (VIN) o matrícula (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Recomendado para comprobar compatibilidad exacta en CAT"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                value={vehicleVin}
                onChangeText={setVehicleVin}
              />

              <Text style={styles.label}>Observaciones o dudas técnicas (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Indica cualquier detalle sobre entrega, código de motor o consulta técnica"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                value={deliveryNotes}
                onChangeText={setDeliveryNotes}
              />

              <Pressable
                style={styles.submitBtn}
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="Registrar consulta de disponibilidad localmente"
              >
                <Text style={styles.submitBtnText}>
                  Registrar consulta de disponibilidad
                </Text>
              </Pressable>

              <Text style={styles.submitNotice}>
                Esta solicitud se registra exclusivamente de forma local en tu dispositivo. No se transmite automáticamente al desguace ni se realiza reserva de stock.
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
    paddingBottom: spacing.xxl,
  },
  container: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warningCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  warningCardBody: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    marginBottom: 6,
  },
  warningCardFootnote: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  selectionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vendorGroupSummary: {
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupVendorName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  miniItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  miniItemTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  miniItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  groupSubtotalText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },
  provisionalNote: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
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
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  textArea: {
    height: 70,
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
    fontSize: 14,
  },
  submitNotice: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 14,
  },
  confirmedBox: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  confirmedBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  confirmedBadgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },
  confirmedHeading: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  disclaimerWarningBox: {
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  disclaimerWarningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  disclaimerWarningBody: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  summaryCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
    marginBottom: spacing.lg,
  },
  summaryHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  summaryRowText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  bold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  secondaryBtn: {
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
});
