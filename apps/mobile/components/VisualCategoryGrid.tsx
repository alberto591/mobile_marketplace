import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CategoryGroupSummary } from '../services/catalog-service.interface';
import { catalogService } from '../services/catalog-service.factory';
import { borderRadius, colors, spacing, typography } from '../theme/index';

interface VisualCategoryGridProps {
  readonly onSelectCategory?: (category: CategoryGroupSummary) => void;
}

export function VisualCategoryGrid({ onSelectCategory }: VisualCategoryGridProps) {
  const [categories, setCategories] = useState<readonly CategoryGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    catalogService
      .getCategoryGroups()
      .then((groups) => {
        if (isMounted) {
          // Filter to only display populated categories from actual catalogue data
          setCategories(groups.filter((g) => g.count > 0));
        }
      })
      .catch(() => {
        if (isMounted) {
          setCategories([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePress = (category: CategoryGroupSummary) => {
    if (onSelectCategory) {
      onSelectCategory(category);
      return;
    }

    router.push({
      pathname: '/results',
      params: {
        categoryIds: category.categoryIds.join(','),
        categoryLabel: category.label,
        fromCategoryGrid: 'true',
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.loadingText}>Cargando categorías del desguace...</Text>
      </View>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Explorar por categoría</Text>
        <Text style={styles.sectionSubtitle}>Recambios verificados en estantería</Text>
      </View>

      <View style={styles.grid}>
        {categories.map((cat) => {
          const icon = (cat.iconName as any) || 'construct-outline';
          return (
            <Pressable
              key={cat.id}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => handlePress(cat)}
              accessibilityRole="button"
              accessibilityLabel={`Categoría ${cat.label}, ${cat.count} ${cat.count === 1 ? 'recambio disponible' : 'recambios disponibles'}`}
            >
              <View style={styles.iconContainer}>
                <Ionicons name={icon} size={22} color={colors.accent} />
              </View>

              <View style={styles.content}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {cat.label}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {cat.subtitle}
                </Text>

                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {cat.count} {cat.count === 1 ? 'pieza' : 'piezas'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  headerRow: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.titleMedium,
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.xs,
    fontSize: typography.caption.fontSize,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: colors.cardSecondary,
    borderColor: colors.accent,
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(202, 2, 2, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  content: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 18,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  countBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
