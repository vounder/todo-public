import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { tint, tagTextColor } from '../theme/tokens';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Nutzerfarbe (Tag, Liste). Ohne Angabe greift der Akzent. */
  color?: string;
  selected?: boolean;
  dot?: boolean;
  size?: 'sm' | 'md';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Filter-Chip, Tag-Badge und Status-Pille in einem. */
export function Chip({
  label,
  icon,
  color,
  selected = false,
  dot = false,
  size = 'md',
  onPress,
  style,
}: ChipProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const key = color ?? colors.accent;

  // Farbe traegt als Tint mit voller Kante -- kraeftig genug, um erkennbar
  // zu sein, ohne die Karte zu dominieren.
  const containerStyle = [
    styles.base,
    size === 'sm' && styles.sm,
    selected
      ? { backgroundColor: color ? tint(key, '20') : colors.accentSurface, borderColor: 'transparent' }
      : { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    style,
  ];
  const fg = selected ? (color ? tagTextColor(key, colors.isDark) : colors.accent) : colors.textSub;

  const content = (
    <>
      {dot && <View style={[styles.dot, { backgroundColor: key }]} />}
      {icon && <Ionicons name={icon} size={size === 'sm' ? 12 : 14} color={fg} />}
      <Text style={[size === 'sm' ? styles.labelSm : styles.label, { color: fg }]}>{label}</Text>
    </>
  );

  if (!onPress) return <View style={containerStyle}>{content}</View>;

  return (
    <TouchableOpacity style={[containerStyle, { minHeight: 48, minWidth: 48, justifyContent: 'center' }]} onPress={onPress} activeOpacity={0.7}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }}>
      {content}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    base: {
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs + 2,
      paddingHorizontal: t.spacing.md,
      paddingVertical: 6,
      borderRadius: t.radius.pill,
      borderWidth: 1,
    },
    sm: { paddingHorizontal: t.spacing.sm, paddingVertical: 3 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    label: { ...t.type.label, flexShrink: 1 },
    labelSm: { ...t.type.caption, flexShrink: 1 },
  });
