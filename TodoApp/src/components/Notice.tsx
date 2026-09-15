import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme, useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';
import { Button } from './Button';

export function Notice({ message, action, onAction, tone = 'warning' }: {
  message: string; action?: string; onAction?: () => void; tone?: 'warning' | 'danger' | 'info';
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = tone === 'info' ? colors.accent : colors[tone];
  return (
    <View style={[styles.box, { backgroundColor: tone === 'info' ? colors.accentSurface : colors[`${tone}Surface`] }]}>
      <Ionicons name={tone === 'info' ? 'information-circle-outline' : 'alert-circle-outline'} size={20} color={color} accessible={false} />
      <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>
      {action && onAction && <Button variant="ghost" size="sm" standalone onPress={onAction}>{action}</Button>}
    </View>
  );
}
const createStyles = (t: Theme) => StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  message: { ...t.type.caption, color: t.colors.text, flex: 1, paddingVertical: 8 },
});
