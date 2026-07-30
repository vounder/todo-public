import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  muted?: boolean;
  selected?: boolean;
}

/** Zeile in Action Sheets und Auswahllisten. */
export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  onLongPress,
  destructive = false,
  muted = false,
  selected = false,
}: ListRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const fg = destructive ? colors.danger : muted ? colors.textMuted : colors.text;

  return (
    <TouchableOpacity
      style={[styles.row, selected && styles.selected]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      activeOpacity={0.7}
    >
      {leading}
      {icon && <Ionicons name={icon} size={20} color={fg} />}
      <View style={styles.body}>
        <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.sm,
      borderRadius: t.radius.sm,
    },
    selected: { backgroundColor: t.colors.accentSurface },
    body: { flex: 1 },
    title: { ...t.type.bodyStrong },
    subtitle: { ...t.type.caption, color: t.colors.textMuted, marginTop: 2 },
  });
