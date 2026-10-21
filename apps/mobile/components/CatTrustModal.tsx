import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Vendor } from '@mobile-marketplace/core';
import { evaluateSellerTrust } from '../services/seller-trust.service';
import { borderRadius, colors, spacing } from '../theme/index';

interface Props {
  readonly visible: boolean;
  readonly vendor: Vendor;
  readonly onClose: () => void;
}

export function CatTrustModal({ visible, vendor, onClose }: Props) {
  const trust = evaluateSellerTrust(vendor);

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Gracefully handle link opening failure
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Transparencia y Garantías del Vendedor</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Cerrar modal de información del desguace"
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Status Pill */}
            <View
              style={[
                styles.statusPill,
                trust.isCatVerified ? styles.statusPillVerified : styles.statusPillUnverified,
              ]}
            >
              <Ionicons
                name={trust.isCatVerified ? 'shield-checkmark' : 'alert-circle-outline'}
                size={18}
                color={trust.isCatVerified ? colors.verified : colors.warning}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.statusPillText,
                  trust.isCatVerified ? styles.statusTextVerified : styles.statusTextUnverified,
                ]}
              >
                {trust.badgeLabel}
              </Text>
            </View>

            {/* Legal Seller Data */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Desguace Vendedor (Sujeto Pasivo Legal)</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataKey}>Razón Social:</Text>
                <Text style={styles.dataVal}>{trust.legalSellerName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataKey}>Nombre Comercial:</Text>
                <Text style={styles.dataVal}>{trust.tradeName}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataKey}>Autorización CAT:</Text>
                <Text style={styles.dataVal}>{trust.catAuthorizationCode}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataKey}>Ubicación:</Text>
                <Text style={styles.dataVal}>
                  {vendor.location.city} ({vendor.location.province}), {vendor.location.postalCode}
                </Text>
              </View>
            </View>

            {/* Warranty & Returns */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Garantías Legales y Devoluciones</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataKey}>Garantía legal:</Text>
                <Text style={styles.dataValBold}>
                  {trust.warrantyMonths} meses mínimos conforme a Ley
                </Text>
              </View>
              <Text style={styles.explanatoryText}>
                En compras realizadas por consumidores particulares, la garantía en bienes usados no puede pactarse por debajo de un año conforme al Real Decreto Legislativo 1/2007.
              </Text>

              <View style={[styles.dataRow, { marginTop: spacing.xs }]}>
                <Text style={styles.dataKey}>Desistimiento:</Text>
                <Text style={styles.dataValBold}>
                  {trust.returnDays} días naturales de plazo
                </Text>
              </View>
              <Text style={styles.explanatoryText}>
                Dispones de 14 días naturales desde la entrega para desistir de la compra en ventas a distancia, siempre que el recambio no haya sido manipulado indebidamente ni alterado.
              </Text>
            </View>

            {/* What is a CAT? */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>¿Qué es un Centro CAT Autorizado?</Text>
              <Text style={styles.explanatoryText}>
                Un Centro Autorizado de Tratamiento (CAT) es una instalación industrial habilitada por la consejería de medio ambiente competente conforme al Real Decreto 265/2021. Realiza la descontaminación y desmontaje legal de piezas con trazabilidad, garantizando que el recambio procede de un vehículo gestionado de forma legal.
              </Text>
            </View>

            {/* Official Legal Sources */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Normativa y Enlaces Oficiales (BOE / CEC)</Text>
              {trust.officialReferences.map((ref, idx) => (
                <Pressable
                  key={idx}
                  style={styles.linkItem}
                  onPress={() => handleOpenLink(ref.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`Abrir ${ref.title}`}
                >
                  <View style={styles.linkTextCol}>
                    <Text style={styles.linkTitle}>{ref.title}</Text>
                    <Text style={styles.linkDesc}>{ref.description}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={colors.accent} />
                </Pressable>
              ))}
            </View>

            {/* Transparency Note */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>{trust.legalDisclaimer}</Text>
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footer}>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Entendido, cerrar ventana informativa"
            >
              <Text style={styles.closeBtnText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  scrollArea: {
    maxHeight: 460,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  statusPillVerified: {
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
  },
  statusPillUnverified: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusTextVerified: {
    color: colors.verified,
  },
  statusTextUnverified: {
    color: colors.warning,
  },
  section: {
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardSecondary,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  dataKey: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  dataVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    maxWidth: '65%',
    textAlign: 'right',
  },
  dataValBold: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.verified,
  },
  explanatoryText: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    marginTop: 2,
    marginBottom: 4,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardSecondary,
    marginBottom: 6,
  },
  linkTextCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  linkTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  linkDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  disclaimerBox: {
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  disclaimerText: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
    fontStyle: 'italic',
  },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  closeBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
