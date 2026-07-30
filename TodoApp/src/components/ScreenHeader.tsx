import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';
import { IconButton } from './IconButton';

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'default' | 'accent' | 'danger';
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: HeaderAction[];
  variant?: 'large' | 'compact';
  /** Suchfeld, Filter-Chips o.ae. unter der Titelzeile. */
  children?: React.ReactNode;
}

/**
 * Einheitlicher Screen-Header.
 *
 * Ersetzt die drei gesaettigten Vollflaechen-Header in je eigener Knallfarbe:
 * neutrale Flaeche, Hairline statt 24px-Rundung, Titel in der Typo-Skala
 * statt 34px/800 mit Uppercase-Eyebrow.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  actions,
  variant = 'large',
  children,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        {onBack && (
          <IconButton
            icon="chevron-back"
            onPress={onBack}
            accessibilityLabel="Zurück"
            size={24}
            style={styles.back}
          />
        )}
        <View style={styles.titleBox}>
          <Text style={variant === 'large' ? styles.titleLarge : styles.titleCompact} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions?.map(a => (
          <IconButton
            key={a.accessibilityLabel}
            icon={a.icon}
            onPress={a.onPress}
            accessibilityLabel={a.accessibilityLabel}
            tone={a.tone}
          />
        ))}
      </View>
      {children}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    header: {
      backgroundColor: t.colors.surface,
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    back: { marginLeft: -t.spacing.sm, marginRight: t.spacing.xs },
    titleBox: { flex: 1, justifyContent: 'center' },
    titleLarge: { ...t.type.display, color: t.colors.text },
    titleCompact: { ...t.type.title, color: t.colors.text },
    subtitle: { ...t.type.caption, color: t.colors.textMuted, marginTop: 2 },
  });
