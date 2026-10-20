import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { PartCard } from '../components/PartCard';
import type {
  CatalogSearchResult,
  SortOrderOption,
} from '../services/catalog-service.interface';
import { catalogService } from '../services/catalog-service.factory';
import { borderRadius, colors, spacing, typography } from '../theme/index';

export default function ResultsScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    oemReference?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogSearchResult | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | undefined>(undefined);
  const [discoveredVendors, setDiscoveredVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortOrderOption>('relevance');

  useEffect(() => {
    let isMounted = true;

    async function fetchResults() {
      setLoading(true);
      setError(null);
      try {
        const res = await catalogService.search({
          query: params.query,
          oemReference: params.oemReference,
          vehicleMake: params.vehicleMake,
          vehicleModel: params.vehicleModel,
          vehicleYear: params.vehicleYear ? Number.parseInt(params.vehicleYear, 10) : undefined,
          vendorId: selectedVendor,
          onlyAvailable,
          sortBy,
        });

        if (isMounted) {
          setResults(res);
          setDiscoveredVendors((prev) => {
            const map = new Map<string, string>();
            for (const v of prev) map.set(v.id, v.name);
            for (const item of res.items) {
              if (item.vendor?.id && item.vendor?.tradeName) {
                map.set(item.vendor.id, item.vendor.tradeName);
              }
            }
            return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
          });
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Error de conexión con el catálogo de desguaces');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchResults();

    return () => {
      isMounted = false;
    };
  }, [
    params.query,
    params.oemReference,
    params.vehicleMake,
    params.vehicleModel,
    params.vehicleYear,
    selectedVendor,
    onlyAvailable,
    sortBy,
  ]);

  const searchSummaryParts = [
    params.query ? `"${params.query}"` : null,
    params.oemReference ? `OEM: ${params.oemReference}` : null,
    params.vehicleMake && params.vehicleModel
      ? `${params.vehicleMake} ${params.vehicleModel}`
      : null,
  ].filter(Boolean);

  const searchSummary = searchSummaryParts.length > 0
    ? searchSummaryParts.join(' · ')
    : 'Todo el catálogo disponible';

  return (
    <View style={styles.screen}>
      {/* Top Filter and Sort Controls */}
      <View style={styles.filtersHeader}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryTitle} numberOfLines={1}>{searchSummary}</Text>
          {results && (
            <Text style={styles.resultCount}>
              {results.totalCount} {results.totalCount === 1 ? 'pieza' : 'piezas'}
            </Text>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.pillsRow}>
          {/* Vendor Filter */}
          <Pressable
            style={[styles.filterPill, !selectedVendor && styles.filterPillActive]}
            onPress={() => setSelectedVendor(undefined)}
          >
            <Text style={[styles.filterPillText, !selectedVendor && styles.filterPillTextActive]}>
              Todos los desguaces
            </Text>
          </Pressable>

          {discoveredVendors.map((vendor) => (
            <Pressable
              key={vendor.id}
              style={[styles.filterPill, selectedVendor === vendor.id && styles.filterPillActive]}
              onPress={() =>
                setSelectedVendor(selectedVendor === vendor.id ? undefined : vendor.id)
              }
            >
              <Text
                style={[
                  styles.filterPillText,
                  selectedVendor === vendor.id && styles.filterPillTextActive,
                ]}
              >
                {vendor.name}
              </Text>
            </Pressable>
          ))}

          {/* Availability Filter */}
          <Pressable
            style={[styles.filterPill, onlyAvailable && styles.filterPillActive]}
            onPress={() => setOnlyAvailable(!onlyAvailable)}
          >
            <Text style={[styles.filterPillText, onlyAvailable && styles.filterPillTextActive]}>
              Disponibles en catálogo
            </Text>
          </Pressable>
        </View>

        {/* Sort Row */}
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Ordenar por:</Text>
          <Pressable
            onPress={() => setSortBy('relevance')}
            style={[styles.sortBtn, sortBy === 'relevance' && styles.sortBtnActive]}
          >
            <Text style={[styles.sortBtnText, sortBy === 'relevance' && styles.sortBtnTextActive]}>
              Relevancia
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSortBy('price_asc')}
            style={[styles.sortBtn, sortBy === 'price_asc' && styles.sortBtnActive]}
          >
            <Text style={[styles.sortBtnText, sortBy === 'price_asc' && styles.sortBtnTextActive]}>
              Precio menor
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSortBy('confidence')}
            style={[styles.sortBtn, sortBy === 'confidence' && styles.sortBtnActive]}
          >
            <Text style={[styles.sortBtnText, sortBy === 'confidence' && styles.sortBtnTextActive]}>
              Compatibilidad
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Provider partial errors notice (if any) */}
      {results?.providerErrors && results.providerErrors.length > 0 && (
        <View style={styles.providerErrorBox}>
          <Text style={styles.providerErrorText}>
            Aviso de sincronización: uno de los desguaces no respondió ({results.providerErrors.length} incidencia). Mostrando resultados del resto del catálogo.
          </Text>
        </View>
      )}

      {/* Results List */}
      {error ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="Fallo de conexión con el catálogo"
            message={`No se pudo conectar con el catálogo en vivo: ${error}. Por honestidad en el inventario, no se muestran recambios ficticios.`}
            actionLabel="Reintentar búsqueda"
            onAction={() => router.replace({ pathname: '/results', params })}
            secondaryActionLabel="Volver al buscador"
            onSecondaryAction={() => router.back()}
          />
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Buscando en catálogo de desguaces...</Text>
        </View>
      ) : results && results.items.length > 0 ? (
        <FlatList
          data={results.items}
          keyExtractor={(item) => item.part.id}
          renderItem={({ item }) => <PartCard item={item} />}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No se encontraron piezas"
            message={`No hay recambios disponibles que coincidan con ${searchSummary}. Puedes probar a buscar solo por la referencia OEM o cambiar los filtros.`}
            actionLabel="Modificar búsqueda"
            onAction={() => router.back()}
            secondaryActionLabel="Restablecer filtros"
            onSecondaryAction={() => {
              setSelectedVendor(undefined);
              setOnlyAvailable(false);
              setSortBy('relevance');
            }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filtersHeader: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.textInverse,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sortLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  sortBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  sortBtnActive: {
    backgroundColor: colors.accentSubtle,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  sortBtnTextActive: {
    fontWeight: '700',
    color: colors.accent,
  },
  providerErrorBox: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
  },
  providerErrorText: {
    fontSize: 11,
    color: colors.warning,
    lineHeight: 15,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.huge * 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: spacing.md,
  },
});
