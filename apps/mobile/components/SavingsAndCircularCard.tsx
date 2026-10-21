import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createMoney, formatMoney } from '@mobile-marketplace/core';
import type {
  ComparableNewPriceSource,
  EnvironmentalImpactEstimate,
} from '../services/savings-comparison.service';
import { calculateSavingsAndImpact } from '../services/savings-comparison.service';
import { borderRadius, colors, spacing } from '../theme/index';

interface Props {
  readonly usedPriceCents: number;
  readonly comparableNewPrice?: ComparableNewPriceSource;
  readonly environmentalImpact?: EnvironmentalImpactEstimate;
}

export function SavingsAndCircularCard({
  usedPriceCents,
  comparableNewPrice,
  environmentalImpact,
}: Props) {
  const result = calculateSavingsAndImpact(
    usedPriceCents,
    comparableNewPrice,
    environmentalImpact
  );

  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeading}>Ahorro y Economía Circular</Text>

      {/* Commercial Savings Breakdown */}
      {result.hasValidComparison && result.comparableNewPriceCents && result.absoluteSavingsCents ? (
        <View style={styles.savingsBox}>
          <View style={styles.badgeRow}>
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsBadgeText}>
                -{result.percentageSavings}% frente a nuevo
              </Text>
            </View>
            <Text style={styles.savingsAbsolute}>
              Ahorras {formatMoney(createMoney(result.absoluteSavingsCents))}
            </Text>
          </View>

          <View style={styles.comparisonTable}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>PVP nuevo verificado:</Text>
              <Text style={styles.tableValuePvp}>
                {formatMoney(createMoney(result.comparableNewPriceCents))}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Precio pieza recuperada:</Text>
              <Text style={styles.tableValueUsed}>
                {formatMoney(createMoney(result.usedPriceCents))}
              </Text>
            </View>
            {comparableNewPrice?.sourceName && (
              <Text style={styles.sourceText}>
                Fuente: {comparableNewPrice.sourceName} ({comparableNewPrice.sourceDate})
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.benchmarkBox}>
          <View style={styles.badgeRow}>
            <View style={styles.benchmarkBadge}>
              <Ionicons name="trending-down-outline" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.benchmarkBadgeText}>
                {result.sectorBenchmark.summary}
              </Text>
            </View>
          </View>
          <Text style={styles.benchmarkDesc}>
            {result.sectorBenchmark.explanation}
          </Text>
          <Text style={styles.benchmarkNotice}>
            {result.sectorBenchmark.transparencyNotice}
          </Text>
        </View>
      )}

      {/* Circular Economy Message */}
      <View style={styles.circularBox}>
        <View style={styles.circularHeader}>
          <Ionicons name="leaf-outline" size={18} color={colors.verified} style={{ marginRight: 6 }} />
          <Text style={styles.circularTitle}>Compromiso ambiental CAT</Text>
        </View>

        <Text style={styles.circularDesc}>{result.environmental.circularMessage}</Text>

        {result.environmental.hasNumericCo2 && (
          <View style={styles.co2Pill}>
            <Ionicons name="shield-checkmark-outline" size={13} color={colors.verified} style={{ marginRight: 4 }} />
            <Text style={styles.co2PillText}>{result.environmental.numericCo2Text}</Text>
          </View>
        )}

        <Text style={styles.transparencyNote}>{result.environmental.transparencyNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  savingsBox: {
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  savingsBadge: {
    backgroundColor: colors.verified,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  savingsBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  savingsAbsolute: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.verified,
  },
  comparisonTable: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  tableLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  tableValuePvp: {
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  tableValueUsed: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sourceText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  benchmarkBox: {
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  benchmarkBadge: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  benchmarkBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  benchmarkDesc: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
    marginBottom: 4,
  },
  benchmarkNotice: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
    fontStyle: 'italic',
  },
  circularBox: {
    paddingTop: spacing.xs,
  },
  circularHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  circularTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.verified,
  },
  circularDesc: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
    marginBottom: spacing.xs,
  },
  co2Pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.verifiedBg,
    borderColor: colors.verifiedBorder,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  co2PillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.verified,
  },
  transparencyNote: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
});
