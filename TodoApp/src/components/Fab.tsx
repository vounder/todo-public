import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export interface FabProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** Beschriftung macht aus dem Kreis eine Pille. */
  label?: string;
  variant?: 'primary' | 'secondary';
  /** Abstand ueber der unteren Bildschirmkante. */
  offset?: number;
}

/**
 * Schwebender Aktionsbutton.
 *
 * Ohne farbigen Glow-Schatten: `shadowColor` ist die Schattenfarbe der
 * Palette, nicht der Akzent. Farbige Schatten mit shadowOpacity 0.4 waren
 * das staerkste "verspielt"-Signal im Bestand.
 */
export function Fab({
  icon,
  onPress,
  accessibilityLabel,
  label,
  variant = 'primary',
  offset = 24,
}: FabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const fg = variant === 'primary' ? colors.onAccent : colors.accent;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        label ? styles.pill : styles.circle,
        variant === 'primary' ? styles.primary : styles.secondary,
        // Kein insets.bottom: Der Screen endet bereits ueber der Tab-Leiste,
        // und die traegt die Safe-Area-Inset selbst. Beides zu addieren
        // wuerde den Button doppelt so hoch schieben.
        { bottom: offset },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.85}
    >
      <Ionicons name={icon} size={label ? 18 : 26} color={fg} />
      {label ? <Text style={[styles.label, { color: fg }]}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    base: {
      position: 'absolute',
      right: t.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.sm,
      ...t.elevation.e2,
    },
    circle: { width: 56, height: 56, borderRadius: t.radius.pill },
    pill: { height: 48, paddingHorizontal: t.spacing.lg, borderRadius: t.radius.pill },
    primary: { backgroundColor: t.colors.accent },
    secondary: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
    label: { ...t.type.bodyStrong },
  });
