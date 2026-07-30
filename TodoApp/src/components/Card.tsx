import React from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Theme, useThemedStyles } from '../theme/ThemeContext';

export interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  padding?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  elevation?: 1 | 2;
  row?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  onLongPress,
  padding = 'lg',
  selected = false,
  elevation = 1,
  row = false,
  style,
}: CardProps) {
  const styles = useThemedStyles(createStyles);
  const composed = [
    styles.card,
    elevation === 2 ? styles.e2 : styles.e1,
    styles[padding],
    row && styles.row,
    selected && styles.selected,
    style,
  ];

  if (!onPress && !onLongPress) return <View style={composed}>{children}</View>;

  return (
    <TouchableOpacity style={composed} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      {children}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: t.colors.surface, borderRadius: t.radius.md },
    e1: { ...t.elevation.e1 },
    e2: { ...t.elevation.e2 },
    sm: { padding: t.spacing.sm },
    md: { padding: t.spacing.md },
    lg: { padding: t.spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center' },
    selected: { borderWidth: 1, borderColor: t.colors.accentBorder, backgroundColor: t.colors.accentSurface },
  });
