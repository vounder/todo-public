import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { Theme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from './Text';
import { Button } from './Button';
import { IconButton } from './IconButton';

type Message = { text: string; action?: string; onAction?: () => void | Promise<void> };
export function useSnackbar(bottom = 16) {
  const [message, setMessage] = useState<Message | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const styles = useThemedStyles(createStyles);
  const dismiss = useCallback(() => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
  }, []);
  const show = useCallback((next: Message) => {
    const id = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    // Respect Android's accessibility timeout; actions remain available longer.
    (AccessibilityInfo.getRecommendedTimeoutMillis?.(next.onAction ? 10000 : 5000) || Promise.resolve(next.onAction ? 10000 : 5000)).then(ms => {
      if (id === generation.current) timer.current = setTimeout(dismiss, ms);
    }).catch(() => {
      if (id === generation.current) timer.current = setTimeout(dismiss, 10000);
    });
  }, [dismiss]);
  useEffect(() => () => { generation.current++; if (timer.current) clearTimeout(timer.current); }, []);
  const element = message ? (
    <View style={[styles.bar, { bottom }]}>
      <Text style={styles.text} accessibilityLiveRegion="polite">{message.text}</Text>
      {message.action && message.onAction && <Button standalone variant="ghost" size="sm" onPress={() => {
        const action = message.onAction;
        dismiss();
        Promise.resolve().then(() => action?.()).catch(() => show({ text: 'Die Aktion konnte nicht ausgeführt werden.' }));
      }}>{message.action}</Button>}
      <IconButton icon="close" accessibilityLabel="Meldung schließen" onPress={dismiss} />
    </View>
  ) : null;
  return { show, dismiss, element };
}
const createStyles = (t: Theme) => StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, zIndex: 20, flexDirection: 'row', alignItems: 'center',
    paddingLeft: 16, paddingRight: 4, paddingVertical: 4, gap: 4, borderRadius: t.radius.lg,
    backgroundColor: t.colors.surface, ...t.elevation.e2 },
  text: { ...t.type.label, color: t.colors.text, flex: 1, paddingVertical: 8 },
});
