import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  variant?: 'plain' | 'tonal';
  tone?: 'default' | 'accent' | 'danger';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  variant = 'plain',
  tone = 'default',
  style,
  disabled = false,
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = { default: colors.textSub, accent: colors.accent, danger: colors.danger }[tone];

  return (
    <TouchableOpacity
      style={[styles.base, variant === 'tonal' && styles.tonal, disabled && { opacity: 0.4 }, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={size} color={color} />
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    base: {
      width: 48,
      height: 48,
      borderRadius: t.radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tonal: { backgroundColor: t.colors.surfaceAlt },
  });
