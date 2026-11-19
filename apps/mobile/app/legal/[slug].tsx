import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LegalLinks } from '../../components/LegalLinks';
import { findLegalDocument, hasPendingOperatorData } from '../../content/legal';
import { borderRadius, colors, spacing } from '../../theme/index';

export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const doc = findLegalDocument(slug);

  if (!doc) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Stack.Screen options={{ title: 'Información legal' }} />
        <Text style={styles.title}>Página no encontrada</Text>
        <Text style={styles.link} accessibilityRole="link" onPress={() => router.replace('/legal' as Href)}>
          Ver toda la información legal
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: doc.title }} />
      <Text style={styles.title} accessibilityRole="header">
        {doc.title}
      </Text>
      <Text style={styles.updated}>Última actualización: {doc.updatedAt}</Text>

      {hasPendingOperatorData() && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            Versión preliminar: faltan por completar los datos del titular de la plataforma.
          </Text>
        </View>
      )}

      {doc.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading} accessibilityRole="header">
            {section.heading}
          </Text>
          {section.paragraphs?.map((text, i) => (
            <Text key={`p${i}`} style={styles.paragraph}>
              {text}
            </Text>
          ))}
          {section.bullets?.map((text, i) => (
            <View key={`b${i}`} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{text}</Text>
            </View>
          ))}
          {section.after?.map((text, i) => (
            <Text key={`a${i}`} style={[styles.paragraph, styles.afterParagraph]}>
              {text}
            </Text>
          ))}
        </View>
      ))}

      <LegalLinks />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  updated: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  pendingBanner: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  pendingText: { fontSize: 13, lineHeight: 19, color: colors.warning },
  section: { marginBottom: spacing.xl },
  heading: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  paragraph: { fontSize: 15, lineHeight: 23, color: colors.textSecondary, marginBottom: spacing.sm },
  afterParagraph: { marginTop: spacing.xs },
  bulletRow: { flexDirection: 'row', marginBottom: spacing.sm, paddingRight: spacing.sm },
  bulletDot: { width: 16, fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  link: { fontSize: 15, color: colors.accent, textDecorationLine: 'underline', marginTop: spacing.md },
});
