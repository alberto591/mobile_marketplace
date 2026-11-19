import { router } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_DOCUMENTS, OPERATOR } from '../../content/legal';
import { borderRadius, colors, spacing } from '../../theme/index';

export default function LegalIndexScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        Información legal
      </Text>
      <Text style={styles.intro}>
        Condiciones de {OPERATOR.brand}. Son las mismas para todos los desguaces que venden en la plataforma.
      </Text>

      {LEGAL_DOCUMENTS.map((doc) => (
        <Pressable
          key={doc.slug}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => router.push(`/legal/${doc.slug}` as Href)}
          accessibilityRole="link"
          accessibilityLabel={doc.title}
        >
          <Text style={styles.cardTitle}>{doc.title}</Text>
          <Text style={styles.cardSummary}>{doc.summary}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  intro: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardPressed: { opacity: 0.7 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  cardSummary: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
});
