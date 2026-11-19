import { router } from 'expo-router';
import type { Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LEGAL_DOCUMENTS } from '../content/legal';
import { colors, spacing } from '../theme/index';

/** Row of links to the legal texts, for the bottom of a screen. */
export function LegalLinks() {
  return (
    <View style={styles.container} accessibilityRole="summary">
      {LEGAL_DOCUMENTS.map((doc, index) => (
        <React.Fragment key={doc.slug}>
          {index > 0 && <Text style={styles.separator}>·</Text>}
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => router.push(`/legal/${doc.slug}` as Href)}
          >
            {doc.title}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  separator: {
    color: colors.textMuted,
    fontSize: 13,
  },
  link: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
