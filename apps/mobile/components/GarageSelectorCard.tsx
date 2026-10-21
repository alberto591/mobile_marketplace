import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { catalogService } from '../services/catalog-service.factory';
import type { AvailableVehicleMake } from '../services/catalog-service.interface';
import { useGarage } from '../services/garage-context';
import { borderRadius, colors, spacing, typography } from '../theme/index';

export function GarageSelectorCard() {
  const { selectedVehicle, setVehicle, clearVehicle, hasVehicle } = useGarage();
  const [modalVisible, setModalVisible] = useState(false);
  const [availableVehicles, setAvailableVehicles] = useState<readonly AvailableVehicleMake[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  // Modal form state
  const [selectedMake, setSelectedMake] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [inputYear, setInputYear] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    async function loadCatalogVehicles() {
      setLoadingVehicles(true);
      try {
        const res = await catalogService.getAvailableVehicles();
        if (isMounted) {
          setAvailableVehicles(res);
        }
      } catch {
        // Fallback to empty if catalog error
      } finally {
        if (isMounted) {
          setLoadingVehicles(false);
        }
      }
    }

    loadCatalogVehicles();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenModal = () => {
    if (selectedVehicle) {
      setSelectedMake(selectedVehicle.make);
      setSelectedModel(selectedVehicle.model);
      setInputYear(selectedVehicle.year ? String(selectedVehicle.year) : '');
    } else {
      setSelectedMake('');
      setSelectedModel('');
      setInputYear('');
    }
    setModalVisible(true);
  };

  const handleSaveVehicle = async () => {
    if (!selectedMake || !selectedModel) return;

    const parsedYear = inputYear.trim() ? parseInt(inputYear.trim(), 10) : undefined;
    const year = parsedYear && !isNaN(parsedYear) ? parsedYear : undefined;

    await setVehicle({
      make: selectedMake,
      model: selectedModel,
      year,
    });
    setModalVisible(false);
  };

  const handleQuickSearchForVehicle = () => {
    if (!selectedVehicle) return;
    router.push({
      pathname: '/results',
      params: {
        vehicleMake: selectedVehicle.make,
        vehicleModel: selectedVehicle.model,
        vehicleYear: selectedVehicle.year ? String(selectedVehicle.year) : undefined,
      },
    });
  };

  const availableModelsForMake =
    availableVehicles.find((v) => v.make === selectedMake)?.models ?? [];

  return (
    <View style={styles.container}>
      {!hasVehicle ? (
        <View style={styles.cardEmpty}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="car-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.titleCol}>
              <Text style={styles.cardTitle}>Mi Garaje</Text>
              <Text style={styles.cardSubtitle}>
                Guarda tu coche para filtrar automáticamente los recambios compatibles con el vehículo donante.
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.selectBtn, pressed && styles.selectBtnPressed]}
            onPress={handleOpenModal}
            accessibilityRole="button"
            accessibilityLabel="Selecciona tu vehículo para guardarlo en Mi Garaje"
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.selectBtnText}>Selecciona tu vehículo</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardFilled}>
          <View style={styles.headerRow}>
            <View style={[styles.iconCircle, styles.iconCircleActive]}>
              <Ionicons name="car-sport" size={22} color={colors.accent} />
            </View>
            <View style={styles.titleCol}>
              <View style={styles.tagRow}>
                <Text style={styles.tagLabel}>Mi Garaje · Activo</Text>
              </View>
              <Text style={styles.vehicleName}>
                {selectedVehicle?.make} {selectedVehicle?.model}
                {selectedVehicle?.year ? ` (${selectedVehicle.year})` : ''}
              </Text>
              <Text style={styles.fitmentNotice}>
                Coincidencia con vehículo donante del desguace. Comprueba siempre la referencia troquelada antes de instalar.
              </Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [styles.searchMyCarBtn, pressed && styles.btnPressed]}
              onPress={handleQuickSearchForVehicle}
              accessibilityRole="button"
              accessibilityLabel={`Buscar recambios para ${selectedVehicle?.make} ${selectedVehicle?.model}`}
            >
              <Ionicons name="search" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.searchMyCarText}>Buscar piezas</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}
              onPress={handleOpenModal}
              accessibilityRole="button"
              accessibilityLabel="Cambiar vehículo guardado"
            >
              <Text style={styles.secondaryBtnText}>Cambiar</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.clearBtn, pressed && styles.btnPressed]}
              onPress={clearVehicle}
              accessibilityRole="button"
              accessibilityLabel="Quitar vehículo de Mi Garaje"
            >
              <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Vehicle Selector Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecciona tu vehículo</Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cerrar ventana de selección de vehículo"
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Opciones obtenidas del inventario real de los desguaces asociados.
            </Text>

            {loadingVehicles ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.modalLoadingText}>Cargando marcas del catálogo...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                {/* 1. Make Selection */}
                <Text style={styles.stepLabel}>1. Marca</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {availableVehicles.map((v) => {
                    const isSelected = selectedMake === v.make;
                    return (
                      <Pressable
                        key={v.make}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => {
                          setSelectedMake(v.make);
                          setSelectedModel('');
                        }}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          {v.make}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* 2. Model Selection */}
                {Boolean(selectedMake) && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepLabel}>2. Modelo ({selectedMake})</Text>
                    <View style={styles.modelGrid}>
                      {availableModelsForMake.map((m) => {
                        const isSelected = selectedModel === m;
                        return (
                          <Pressable
                            key={m}
                            style={[styles.modelChip, isSelected && styles.chipActive]}
                            onPress={() => setSelectedModel(m)}
                          >
                            <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                              {m}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* 3. Optional Year */}
                {Boolean(selectedModel) && (
                  <View style={styles.stepContainer}>
                    <Text style={styles.stepLabel}>3. Año de matriculación (Opcional)</Text>
                    <TextInput
                      style={styles.yearInput}
                      placeholder="Ej. 2008"
                      placeholderTextColor={colors.textMuted}
                      value={inputYear}
                      onChangeText={setInputYear}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <Text style={styles.inputHelp}>
                      Ayuda a descartar recambios de generaciones anteriores o posteriores.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={[
                  styles.saveBtn,
                  (!selectedMake || !selectedModel) && styles.saveBtnDisabled,
                ]}
                disabled={!selectedMake || !selectedModel}
                onPress={handleSaveVehicle}
              >
                <Text style={styles.saveBtnText}>Guardar vehículo</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  cardEmpty: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardFilled: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.accent,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: {
    backgroundColor: 'rgba(234, 88, 12, 0.1)',
  },
  titleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  tagRow: {
    marginBottom: 2,
  },
  tagLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  fitmentNotice: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  selectBtnPressed: {
    opacity: 0.85,
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardSecondary,
  },
  searchMyCarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  searchMyCarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clearBtn: {
    padding: 8,
    backgroundColor: colors.cardSecondary,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.75,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  modalLoading: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoadingText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalScroll: {
    maxHeight: 320,
  },
  stepContainer: {
    marginTop: spacing.md,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  modelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
  },
  inputHelp: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
  },
  saveBtnDisabled: {
    backgroundColor: colors.border,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
