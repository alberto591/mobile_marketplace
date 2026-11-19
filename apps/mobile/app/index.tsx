import { LegalLinks } from '../components/LegalLinks';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, typography } from '../theme/index';
import { GarageSelectorCard } from '../components/GarageSelectorCard';
import { VisualCategoryGrid } from '../components/VisualCategoryGrid';
import { catalogService } from '../services/catalog-service.factory';
import type { AvailableVehicleMake } from '../services/catalog-service.interface';
import { useFavourites } from '../services/favourites-context';
import { useGarage } from '../services/garage-context';
import {
  clearRecentSearches,
  formatRecentSearchLabel,
  loadRecentSearches,
  saveRecentSearch,
  type RecentSearchEntry,
} from '../services/recent-searches.service';
import {
  filterMakeSuggestions,
  filterModelSuggestions,
} from '../services/vehicle-suggestions.service';

export default function HomeScreen() {
  const { savedCount } = useFavourites();
  const { selectedVehicle } = useGarage();
  const [query, setQuery] = useState('');
  const [oemReference, setOemReference] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [availableVehicles, setAvailableVehicles] = useState<readonly AvailableVehicleMake[]>([]);
  const [focusedVehicleField, setFocusedVehicleField] = useState<'make' | 'model' | null>(null);
  const [recentSearches, setRecentSearches] = useState<readonly RecentSearchEntry[]>([]);

  useEffect(() => {
    let mounted = true;
    catalogService
      .getAvailableVehicles()
      .then((list) => {
        if (mounted) setAvailableVehicles(list);
      })
      .catch(() => {
        // Non-fatal: manual text entry still works if catalog vehicles fail to load.
      });
    loadRecentSearches()
      .then((items) => {
        if (mounted) setRecentSearches(items);
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      mounted = false;
    };
  }, []);

  const makeSuggestions = useMemo(() => {
    if (focusedVehicleField !== 'make') return [];
    return filterMakeSuggestions(availableVehicles, vehicleMake, 6);
  }, [availableVehicles, vehicleMake, focusedVehicleField]);

  const modelSuggestions = useMemo(() => {
    if (focusedVehicleField !== 'model') return [];
    const activeMake = vehicleMake.trim() || selectedVehicle?.make || '';
    if (!activeMake) return [];
    return filterModelSuggestions(availableVehicles, activeMake, vehicleModel, 6);
  }, [availableVehicles, vehicleMake, selectedVehicle?.make, vehicleModel, focusedVehicleField]);

  const quickSearches = [
    { label: 'Faros Golf V', q: 'Faro', make: 'Volkswagen', model: 'Golf' },
    { label: 'Radiador Seat', q: 'Radiador', make: 'Seat', model: 'Leon' },
    { label: 'OEM 1K0121205AD', oem: '1K0121205AD' },
    { label: 'Alternadores', q: 'Alternador' },
    { label: 'Retrovisores', q: 'Retrovisor' },
  ];

  const handleSearch = () => {
    const finalMake = vehicleMake.trim() || selectedVehicle?.make;
    const finalModel = vehicleModel.trim() || selectedVehicle?.model;
    const finalYear =
      vehicleYear.trim() || (selectedVehicle?.year ? String(selectedVehicle.year) : undefined);

    if (
      !query.trim() &&
      !oemReference.trim() &&
      (!finalMake || !finalModel)
    ) {
      Alert.alert(
        'Introduce un criterio',
        'Por favor, escribe el nombre de la pieza, una referencia OEM o selecciona tu vehículo en Mi Garaje.'
      );
      return;
    }

    const searchParams = {
      query: query.trim() || undefined,
      oemReference: oemReference.trim() || undefined,
      vehicleMake: finalMake || undefined,
      vehicleModel: finalModel || undefined,
      vehicleYear: finalYear || undefined,
    };

    void saveRecentSearch(searchParams).then((updated) => setRecentSearches(updated));

    router.push({
      pathname: '/results',
      params: searchParams,
    });
  };

  const handleRecentSearchPress = (entry: RecentSearchEntry) => {
    void saveRecentSearch(entry).then((updated) => setRecentSearches(updated));
    router.push({
      pathname: '/results',
      params: {
        query: entry.query,
        oemReference: entry.oemReference,
        vehicleMake: entry.vehicleMake,
        vehicleModel: entry.vehicleModel,
        vehicleYear: entry.vehicleYear,
      },
    });
  };

  const handleClearRecentSearches = () => {
    setRecentSearches([]);
    void clearRecentSearches();
  };

  const handleQuickSearch = (item: (typeof quickSearches)[0]) => {
    router.push({
      pathname: '/results',
      params: {
        query: item.q,
        oemReference: item.oem,
        vehicleMake: item.make,
        vehicleModel: item.model,
      },
    });
  };

  const handleClear = () => {
    setQuery('');
    setOemReference('');
    setVehicleMake('');
    setVehicleModel('');
    setVehicleYear('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>Buscapiezas 24h</Text>
          <Text style={styles.heroSubtitle}>
            Dinos qué pieza necesitas y te decimos quién la tiene. Presupuesto en menos de 24 h y envío a toda España con garantía legal.
          </Text>
        </View>

        {savedCount > 0 && (
          <Pressable
            style={({ pressed }) => [styles.savedBanner, pressed && styles.savedBannerPressed]}
            onPress={() => router.push('/saved')}
            accessibilityRole="button"
            accessibilityLabel={`Tienes ${savedCount} piezas guardadas. Pulsa para verlas`}
          >
            <View style={styles.savedBannerLeft}>
              <Ionicons name="heart" size={18} color={colors.accent} />
              <Text style={styles.savedBannerText}>
                Tienes {savedCount} {savedCount === 1 ? 'pieza guardada' : 'piezas guardadas'}
              </Text>
            </View>
            <View style={styles.savedBannerRight}>
              <Text style={styles.savedBannerAction}>Ver guardados</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </View>
          </Pressable>
        )}

        {/* Mi Garaje - Vehicle Selector */}
        <GarageSelectorCard />

        {/* Main Search Card */}
        <View style={styles.searchCard}>
          {/* 1. Part Name */}
          <Text style={styles.inputLabel}>¿Qué pieza necesitas?</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ej. Faro delantero, alternador, radiador..."
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />

          {/* 2. OEM Reference */}
          <Text style={styles.inputLabel}>Referencia OEM (recomendado)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ej. 1K0121205AD, 0281002500..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            value={oemReference}
            onChangeText={setOemReference}
          />
          <Text style={styles.helperText}>
            La referencia OEM grabada en tu pieza original es la forma más fiable de asegurar compatibilidad.
          </Text>

          {/* 3. Vehicle Info */}
          <View style={styles.vehicleSection}>
            <Text style={styles.sectionTitle}>Datos del vehículo (opcional)</Text>
            <View style={styles.row}>
              <View style={styles.halfCol}>
                <Text style={styles.subLabel}>Marca</Text>
                <TextInput
                  style={styles.smallInput}
                  placeholder="Ej. SEAT, VW"
                  placeholderTextColor={colors.textMuted}
                  value={vehicleMake}
                  onFocus={() => setFocusedVehicleField('make')}
                  onChangeText={setVehicleMake}
                />
              </View>
              <View style={styles.halfCol}>
                <Text style={styles.subLabel}>Modelo</Text>
                <TextInput
                  style={styles.smallInput}
                  placeholder="Ej. León, Golf V"
                  placeholderTextColor={colors.textMuted}
                  value={vehicleModel}
                  onFocus={() => setFocusedVehicleField('model')}
                  onChangeText={setVehicleModel}
                />
              </View>
            </View>

            {makeSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggestionsLabel}>Marcas en catálogo:</Text>
                <View style={styles.suggestionsRow}>
                  {makeSuggestions.map((make) => (
                    <Pressable
                      key={make}
                      style={styles.suggestionChip}
                      onPress={() => {
                        setVehicleMake(make);
                        setVehicleModel('');
                        setFocusedVehicleField('model');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Seleccionar marca ${make}`}
                    >
                      <Text style={styles.suggestionChipText}>{make}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {modelSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                <Text style={styles.suggestionsLabel}>Modelos disponibles:</Text>
                <View style={styles.suggestionsRow}>
                  {modelSuggestions.map((model) => (
                    <Pressable
                      key={model}
                      style={styles.suggestionChip}
                      onPress={() => {
                        setVehicleModel(model);
                        setFocusedVehicleField(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Seleccionar modelo ${model}`}
                    >
                      <Text style={styles.suggestionChipText}>{model}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.singleCol}>
              <Text style={styles.subLabel}>Año de matriculación</Text>
              <TextInput
                style={styles.smallInput}
                placeholder="Ej. 2007"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                maxLength={4}
                value={vehicleYear}
                onChangeText={setVehicleYear}
              />
            </View>
          </View>

          {/* Action Buttons */}
          <Pressable style={styles.searchButton} onPress={handleSearch} accessibilityRole="button">
            <Text style={styles.searchButtonText}>Buscar recambios disponibles</Text>
          </Pressable>

          {Boolean(query || oemReference || vehicleMake || vehicleModel || vehicleYear) && (
            <Pressable style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Limpiar campos</Text>
            </Pressable>
          )}
        </View>

        {/* Visual Category Grid */}
        <VisualCategoryGrid />

        {/* Recent Searches */}
        {recentSearches.length > 0 && (
          <View style={styles.quickSection}>
            <View style={styles.recentHeaderRow}>
              <Text style={styles.quickTitle}>Búsquedas recientes</Text>
              <Pressable
                onPress={handleClearRecentSearches}
                accessibilityRole="button"
                accessibilityLabel="Borrar búsquedas recientes"
              >
                <Text style={styles.recentClearText}>Limpiar</Text>
              </Pressable>
            </View>
            <View style={styles.pillContainer}>
              {recentSearches.map((item, idx) => (
                <Pressable
                  key={`${item.timestamp}-${idx}`}
                  style={styles.recentPill}
                  onPress={() => handleRecentSearchPress(item)}
                  accessibilityRole="button"
                >
                  <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.recentPillText} numberOfLines={1}>
                    {formatRecentSearchLabel(item)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Quick Searches */}
        <View style={styles.quickSection}>
          <Text style={styles.quickTitle}>Búsquedas frecuentes</Text>
          <View style={styles.pillContainer}>
            {quickSearches.map((item, idx) => (
              <Pressable
                key={idx}
                style={styles.pill}
                onPress={() => handleQuickSearch(item)}
              >
                <Text style={styles.pillText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Trust Badges */}
        <View style={styles.trustSection}>
          <View style={styles.trustCard}>
            <Text style={styles.trustIcon}>[CAT]</Text>
            <View style={styles.trustContent}>
              <Text style={styles.trustTitle}>Solo Centros CAT Autorizados</Text>
              <Text style={styles.trustDesc}>
                Centros autorizados de tratamiento de vehículos conforme al Real Decreto 265/2021.
              </Text>
            </View>
          </View>

          <View style={styles.trustCard}>
            <Text style={styles.trustIcon}>[1 Año]</Text>
            <View style={styles.trustContent}>
              <Text style={styles.trustTitle}>Garantía Legal Incluida</Text>
              <Text style={styles.trustDesc}>
                Todas las piezas disponen de 1 año de garantía conforme a la Ley de Consumidores.
              </Text>
            </View>
          </View>

          <View style={styles.trustCard}>
            <Text style={styles.trustIcon}>[Foto]</Text>
            <View style={styles.trustContent}>
              <Text style={styles.trustTitle}>Fotos Reales de Cada Pieza</Text>
              <Text style={styles.trustDesc}>
                Visualiza el estado real de la pieza física desmontada, sin imágenes genéricas de catálogo.
              </Text>
            </View>
          </View>
        </View>

        <LegalLinks />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.huge * 2,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.titleLarge,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  savedBannerPressed: {
    opacity: 0.85,
    backgroundColor: colors.cardSecondary,
  },
  savedBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  savedBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  savedBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedBannerAction: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  searchCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: spacing.xl,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  vehicleSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  halfCol: {
    width: '48%',
  },
  singleCol: {
    width: '100%',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  smallInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  searchButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  searchButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '700',
  },
  clearButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  quickSection: {
    marginBottom: spacing.xl,
  },
  quickTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recentClearText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
  },
  recentPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  suggestionsBox: {
    marginBottom: spacing.sm,
    gap: 6,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  trustSection: {
    gap: spacing.sm,
  },
  trustCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  trustIcon: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
    width: 50,
  },
  trustContent: {
    flex: 1,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  trustDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
