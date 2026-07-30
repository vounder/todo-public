import React from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';

export interface CheckboxProps {
  checked: boolean;
  onToggle?: () => void;
  shape?: 'circle' | 'square';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Haekchen als echtes Icon.
 *
 * Im Bestand stand hier ein Text-Glyph, dessen Zeichen in einem frueheren
 * Commit encoding-seitig verloren ging -- mehrere Checkboxen rendern
 * aktuell buchstaeblich nichts.
 */
export function Checkbox({ checked, onToggle, shape = 'circle', size = 24, style }: CheckboxProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const box = (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: shape === 'circle' ? size / 2 : 6 },
        checked && styles.checked,
        style,
      ]}
    >
      {checked && <Ionicons name="checkmark" size={size * 0.62} color={colors.onAccent} />}
    </View>
  );

  if (!onToggle) return box;

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      {box}
    </TouchableOpacity>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    box: {
      borderWidth: 2,
      borderColor: t.colors.borderStrong,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checked: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
  });
