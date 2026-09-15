import React from 'react';
import { Modal, View, Pressable, KeyboardAvoidingView, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';
import { IconButton } from './IconButton';

export interface SheetProps {
  visible: boolean; onClose: () => void; title?: string; subtitle?: string;
  keyboardAware?: boolean; animationType?: 'slide' | 'fade'; bottomInset?: number;
  scrollable?: boolean; maxHeight?: number; headerRight?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, subtitle, keyboardAware = true, animationType = 'slide',
  bottomInset = 16, scrollable = true, maxHeight, headerRight, footer, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  return (
    <Modal visible={visible} animationType={animationType} transparent onRequestClose={onClose}
      statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={[styles.overlay, { paddingTop: insets.top + 16 }]}
        enabled={keyboardAware} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + bottomInset }]} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              {title && <Text style={styles.title} accessibilityRole="header">{title}</Text>}
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            {headerRight}
            <IconButton icon="close" accessibilityLabel="Schließen" onPress={onClose} />
          </View>
          {scrollable ? <ScrollView style={[styles.body, maxHeight ? { maxHeight } : undefined]}
            contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator>{children}</ScrollView> : children}
          {footer && <View style={styles.footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function SheetActions({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.actions}>{children}</View>;
}
const createStyles = (t: Theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: t.colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '100%', flexShrink: 1, backgroundColor: t.colors.sheetBg,
    borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet,
    paddingHorizontal: 20, paddingTop: 12, ...t.elevation.e3 },
  body: { flexShrink: 1 },
  footer: { flexShrink: 0, paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: t.colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 4 },
  title: { ...t.type.title, color: t.colors.text },
  subtitle: { ...t.type.body, color: t.colors.textSub, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
});
