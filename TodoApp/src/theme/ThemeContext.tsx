import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LIGHT,
  DARK,
  Palette,
  spacing,
  radius,
  typography,
  Typography,
  makeElevation,
  Elevation,
} from './tokens';

export { LIGHT, DARK };
export type ThemeColors = Palette;

/** 'system' folgt dem Betriebssystem, 'light'/'dark' ueberschreiben es. */
export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = '@theme_mode';
const LEGACY_KEY = '@dark_mode';

export interface Theme {
  colors: Palette;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleDark: () => void;
  spacing: typeof spacing;
  radius: typeof radius;
  type: Typography;
  elevation: Elevation;
}

function buildTheme(
  isDark: boolean,
  mode: ThemeMode,
  setMode: (m: ThemeMode) => void,
  toggleDark: () => void,
): Theme {
  const colors = isDark ? DARK : LIGHT;
  return {
    colors,
    isDark,
    mode,
    setMode,
    toggleDark,
    spacing,
    radius,
    type: typography,
    elevation: makeElevation(colors),
  };
}

const noop = () => {};
const ThemeContext = createContext<Theme>(buildTheme(false, 'system', noop, noop));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(MODE_KEY);
      if (stored === 'system' || stored === 'light' || stored === 'dark') {
        setModeState(stored);
        return;
      }
      // Migration des alten Boolean-Keys. Wer nie umgeschaltet hat, landet
      // auf 'system' -- das ist die Verbesserung, nicht das alte Default.
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      const migrated: ThemeMode =
        legacy === 'true' ? 'dark' : legacy === 'false' ? 'light' : 'system';
      setModeState(migrated);
      await AsyncStorage.setItem(MODE_KEY, migrated);
      if (legacy !== null) await AsyncStorage.removeItem(LEGACY_KEY);
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next);
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  // Muss stabil sein: useThemedStyles cached ueber die Identitaet des Theme-Objekts.
  const value = useMemo(
    () => buildTheme(isDark, mode, setMode, () => setMode(isDark ? 'light' : 'dark')),
    [isDark, mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Themed StyleSheets.
 *
 * Statt Farben pro Call-Site inline nachzuschieben (`style={[styles.card,
 * { backgroundColor: colors.surface }]}`) baut die Factory das komplette
 * StyleSheet aus dem Theme -- Dark Mode ist damit per Konstruktion korrekt
 * statt luecklenhaft nachgepflegt.
 *
 *   const createStyles = (t: Theme) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(createStyles);
 *
 * Die Factory muss modul-scope sein (stabile Identitaet), sonst greift der
 * Cache nicht und StyleSheet.create laeuft pro Render.
 *
 * Fuer alles, was Prop statt Style ist -- `Ionicons color=`,
 * `placeholderTextColor=`, `Switch trackColor=` -- weiterhin `useTheme()`.
 */
const styleCache = new WeakMap<Theme, Map<(t: Theme) => unknown, unknown>>();

export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => {
    let perTheme = styleCache.get(theme);
    if (!perTheme) {
      perTheme = new Map();
      styleCache.set(theme, perTheme);
    }
    const hit = perTheme.get(factory);
    if (hit) return hit as T;
    const built = factory(theme);
    perTheme.set(factory, built);
    return built;
  }, [theme, factory]);
}
