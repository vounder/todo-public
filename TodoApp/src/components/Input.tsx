import React, { forwardRef } from 'react';
import { TextInput, TextInputProps, View, StyleSheet, ViewStyle } from 'react-native';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

/**
 * Textfeld mit Theme-Farben. Setzt insbesondere `placeholderTextColor` aus
 * dem Theme -- das war app-weit als '#9CA3AF' hartcodiert und damit im Dark
 * Mode kaum lesbar.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, containerStyle, style, ...props },
  ref,
) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[styles.input, !!error && styles.inputError, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const createStyles = (t: Theme) =>
  StyleSheet.create({
    label: { ...t.type.label, color: t.colors.textSub, marginBottom: t.spacing.sm },
    input: {
      ...t.type.body,
      backgroundColor: t.colors.inputBg,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: 13,
      color: t.colors.text,
    },
    inputError: { borderColor: t.colors.danger },
    error: { ...t.type.caption, color: t.colors.danger, marginTop: t.spacing.xs },
  });
