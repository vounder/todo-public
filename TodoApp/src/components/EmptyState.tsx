import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, title, subtitle, children }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={56} color={colors.textMuted} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.spacing.xl,
    },
    icon: { marginBottom: t.spacing.lg, opacity: 0.6 },
    title: { ...t.type.title, color: t.colors.text, marginBottom: t.spacing.sm },
    subtitle: { ...t.type.body, color: t.colors.textSub, textAlign: 'center' },
  });
