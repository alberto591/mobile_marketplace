import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius, colors, spacing } from '../theme/index';

export interface ZoomablePhotoItem {
  readonly id: string;
  readonly url: string;
}

interface PhotoZoomModalProps {
  readonly visible: boolean;
  readonly images: readonly ZoomablePhotoItem[];
  readonly initialIndex: number;
  readonly onClose: () => void;
}

export function PhotoZoomModal({
  visible,
  images,
  initialIndex,
  onClose,
}: PhotoZoomModalProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (visible) {
      setActiveIndex(Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)));
      setZoomed(false);
    }
  }, [visible, initialIndex, images.length]);

  if (!visible || images.length === 0) {
    return null;
  }

  const current = images[activeIndex] ?? images[0];
  const { width, height } = Dimensions.get('window');
  const baseWidth = width;
  const baseHeight = Math.max(height * 0.68, 320);
  const scale = zoomed ? 2 : 1;

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < images.length - 1;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.counterText}>
            Foto {activeIndex + 1} de {images.length}
          </Text>

          <View style={styles.topActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => setZoomed((z) => !z)}
              accessibilityRole="button"
              accessibilityLabel={zoomed ? 'Alejar fotografía' : 'Ampliar fotografía'}
            >
              <Ionicons
                name={zoomed ? 'contract-outline' : 'expand-outline'}
                size={20}
                color={colors.textInverse}
              />
              <Text style={styles.iconBtnText}>{zoomed ? '1x' : '2x'}</Text>
            </Pressable>

            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar visor de fotografía"
            >
              <Ionicons name="close" size={22} color={colors.textInverse} />
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>

        {/* Zoomable image stage */}
        <ScrollView
          style={styles.stage}
          contentContainerStyle={styles.stageContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          horizontal={zoomed}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => setZoomed((z) => !z)}>
            <Image
              source={{ uri: current.url }}
              style={{
                width: baseWidth * scale,
                height: baseHeight * scale,
              }}
              resizeMode="contain"
            />
          </Pressable>
        </ScrollView>

        {/* Bottom navigation & hint */}
        <View style={styles.bottomBar}>
          <Text style={styles.hintText}>
            {Platform.OS === 'ios'
              ? 'Pellizca o toca la imagen para ampliar conectores y referencias'
              : 'Toca la imagen o el botón 2x para ampliar conectores y referencias'}
          </Text>

          {images.length > 1 && (
            <View style={styles.navRow}>
              <Pressable
                style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
                disabled={!canGoPrev}
                onPress={() => {
                  setActiveIndex((i) => Math.max(0, i - 1));
                  setZoomed(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Fotografía anterior"
              >
                <Ionicons name="chevron-back" size={18} color={colors.textInverse} />
                <Text style={styles.navBtnText}>Anterior</Text>
              </Pressable>

              <Pressable
                style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
                disabled={!canGoNext}
                onPress={() => {
                  setActiveIndex((i) => Math.min(images.length - 1, i + 1));
                  setZoomed(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Siguiente fotografía"
              >
                <Text style={styles.navBtnText}>Siguiente</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textInverse} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#090B0E',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(9, 11, 14, 0.92)',
  },
  counterText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  iconBtnText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  closeBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  stage: {
    flex: 1,
  },
  stageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.lg,
    backgroundColor: 'rgba(9, 11, 14, 0.92)',
    gap: spacing.sm,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
});
