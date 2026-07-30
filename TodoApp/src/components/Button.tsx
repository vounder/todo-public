import React from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps {
  children: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  /** Ohne flex:1 -- fuer Buttons, die nicht in einer SheetActions-Zeile stehen. */
  standalone?: boolean;
  style?: ViewStyle;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  standalone = false,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const inactive = disabled || loading;

  const fg = {
    primary: colors.onAccent,
    secondary: colors.text,
    danger: colors.onDanger,
    ghost: colors.accent,
  }[variant];

  const iconNode = icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        styles[variant],
        size === 'sm' && styles.sm,
        !standalone && { flex: 1 },
        inactive && styles.inactive,
        style,
      ]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.content}>
          {iconPosition === 'left' && iconNode}
          <Text style={[size === 'sm' ? styles.labelSm : styles.label, { color: fg }]}>{children}</Text>
          {iconPosition === 'right' && iconNode}
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    base: {
      paddingVertical: 14,
      paddingHorizontal: t.spacing.lg,
      borderRadius: t.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sm: { paddingVertical: 9, paddingHorizontal: t.spacing.md, borderRadius: t.radius.sm },
    content: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    label: { ...t.type.bodyStrong },
    labelSm: { ...t.type.label },
    primary: { backgroundColor: t.colors.accent },
    secondary: { backgroundColor: t.colors.surfaceAlt },
    danger: { backgroundColor: t.colors.danger },
    ghost: { backgroundColor: 'transparent' },
    // Ein Opacity-Dimmer statt einer eigenen Disabled-Farbe pro Variante --
    // funktioniert in beiden Modi und fuer alle vier Varianten gleich.
    inactive: { opacity: 0.45 },
  });
