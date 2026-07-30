import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /**
   * Nur setzen, wenn die urspruengliche Stelle ein KeyboardAvoidingView hatte.
   * Rund die Haelfte der Sheets nutzt ein reines View-Overlay -- Original pro
   * Call-Site spiegeln, nicht pauschal aktivieren.
   */
  keyboardAware?: boolean;
  animationType?: 'slide' | 'fade';
  /** Zusaetzlicher Abstand ueber der Safe Area. Bestand nutzt 16, 20 und 24. */
  bottomInset?: number;
  /** Scrollbarer Body fuer lange Picker. */
  scrollable?: boolean;
  maxHeight?: number;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Bottom Sheet -- ersetzt die 30+ handkopierten Modals.
 *
 * Verhalten ist bewusst identisch zum Bestand: transparentes Modal,
 * Backdrop schliesst per Tap, Handle, Safe-Area-Padding unten.
 * `behavior="padding"` bleibt auf beiden Plattformen so wie es war; ein
 * Wechsel auf "height" wuerde das Tastaturverhalten in 20+ Sheets
 * gleichzeitig aendern, ohne dass Tests das absichern.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  keyboardAware = false,
  animationType = 'slide',
  bottomInset = 16,
  scrollable = false,
  maxHeight,
  headerRight,
  children,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const Container: React.ElementType = keyboardAware ? KeyboardAvoidingView : View;

  const body = scrollable ? (
    <ScrollView
      style={maxHeight ? { maxHeight } : undefined}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal visible={visible} animationType={animationType} transparent onRequestClose={onClose}>
      <Container style={styles.overlay} behavior="padding">
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + bottomInset }]}>
          <View style={styles.handle} />
          {(title || headerRight) && (
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              {headerRight}
            </View>
          )}
          {body}
        </View>
      </Container>
    </Modal>
  );
}

/** Buttonzeile am Fuss eines Sheets. */
export function SheetActions({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.actions}>{children}</View>;
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: t.colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: t.colors.sheetBg,
      borderTopLeftRadius: t.radius.sheet,
      borderTopRightRadius: t.radius.sheet,
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.md,
      ...t.elevation.e3,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.handle,
      alignSelf: 'center',
      marginBottom: t.spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: t.spacing.lg,
      gap: t.spacing.md,
    },
    title: { ...t.type.title, color: t.colors.text },
    subtitle: { ...t.type.body, color: t.colors.textSub, marginTop: t.spacing.xs },
    actions: {
      flexDirection: 'row',
      gap: t.spacing.md,
      marginTop: t.spacing.lg,
    },
  });
