import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CompatibilitySignal } from '@mobile-marketplace/core';
import { borderRadius, colors, spacing } from '../theme/index';

interface Props {
  readonly signal: CompatibilitySignal;
  readonly showDetails?: boolean;
}

export function CompatibilityBadge({ signal, showDetails = false }: Props) {
  let badgeStyle = styles.neutralBadge;
  let textStyle = styles.neutralText;
  let label = 'Compatibilidad sin verificar';

  if (signal.confidence === 'EXACT_OEM_MATCH') {
    if (signal.isGuaranteed) {
      badgeStyle = styles.verifiedBadge;
      textStyle = styles.verifiedText;
      label = 'Referencia OEM verificada';
    } else {
      badgeStyle = styles.warningBadge;
      textStyle = styles.warningText;
      label = 'OEM coincide · Vehículo difiere';
    }
  } else if (signal.confidence === 'ATTRIBUTES_MATCH') {
    badgeStyle = styles.warningBadge;
    textStyle = styles.warningText;
    if (signal.matchedOEM) {
      label = 'Ref. visual coincide · No garantizada OEM';
    } else {
      label = 'Coche donante similar · No garantizado';
    }
  } else if (signal.confidence === 'CATALOG_VERIFIED') {
    badgeStyle = styles.verifiedBadge;
    textStyle = styles.verifiedText;
    label = 'Catálogo cruzado verificado';
  }

  return (
    <View style={styles.container}>
      <View style={[styles.badge, badgeStyle]}>
        <View style={[styles.dot, { backgroundColor: textStyle.color }]} />
        <Text style={[styles.badgeText, textStyle]}>{label}</Text>
      </View>
      {showDetails && (
        <View style={styles.detailsBox}>
          <Text style={styles.summaryText}>{signal.evidenceSummary}</Text>
          <Text style={styles.adviceText}>{signal.userAdvice}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  verifiedBadge: {
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
  },
  verifiedText: {
    color: colors.verified,
  },
  warningBadge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  warningText: {
    color: colors.warning,
  },
  neutralBadge: {
    backgroundColor: colors.neutralBg,
    borderColor: colors.neutralBorder,
  },
  neutralText: {
    color: colors.neutralStatus,
  },
  detailsBox: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  adviceText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
