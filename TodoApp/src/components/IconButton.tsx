import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';

export interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  variant?: 'plain' | 'tonal';
  tone?: 'default' | 'accent' | 'danger';
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  variant = 'plain',
  tone = 'default',
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = { default: colors.textSub, accent: colors.accent, danger: colors.danger }[tone];

  return (
    <TouchableOpacity
      style={[styles.base, variant === 'tonal' && styles.tonal, style]}
      onPress={onPress}
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
      width: 40,
      height: 40,
      borderRadius: t.radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    tonal: { backgroundColor: t.colors.surfaceAlt },
  });
