import React from 'react';
import { Modal, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme, useThemedStyles } from '../theme/ThemeContext';

export interface PopoverProps {
  visible: boolean;
  onClose: () => void;
  /** 'topRight' entspricht den verankerten Kontextmenues im Bestand. */
  anchor?: 'topRight' | 'center';
  offsetTop?: number;
  minWidth?: number;
  children: React.ReactNode;
}

/**
 * Verankertes Kontextmenue.
 *
 * Die fuenf Fade-Menues im Bestand sind keine Bottom Sheets -- sie haengen
 * oben rechts unter dem ausloesenden Button. Deshalb eigene Komponente
 * statt eines Sheet-Sonderfalls.
 */
export function Popover({
  visible,
  onClose,
  anchor = 'topRight',
  offsetTop = 100,
  minWidth = 200,
  children,
}: PopoverProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        style={[styles.overlay, anchor === 'center' && styles.centered]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[styles.menu, { minWidth }, anchor === 'topRight' && { marginTop: offsetTop }]}
          // Taps im Menue duerfen nicht durch den Backdrop schliessen.
          onStartShouldSetResponder={() => true}
        >
          {children}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.colors.overlay,
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
    },
    centered: { alignItems: 'center', justifyContent: 'center' },
    menu: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.md,
      marginRight: t.spacing.lg,
      paddingVertical: t.spacing.sm,
      paddingHorizontal: t.spacing.sm,
      overflow: 'hidden',
      ...t.elevation.e2,
    },
  });
