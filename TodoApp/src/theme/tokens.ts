/**
 * Zentrale Design-Tokens der App.
 *
 * Eine Quelle der Wahrheit fuer Farben, Abstaende, Radien, Typografie und
 * Elevation. Screens greifen nicht direkt hierauf zu, sondern ueber
 * `useTheme()` bzw. `useThemedStyles()` aus ./ThemeContext.
 */

import { Platform, StyleSheet, TextStyle, ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ *
 * Skalen (modusunabhaengig)
 * ------------------------------------------------------------------ */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 24,
  pill: 999,
} as const;

/**
 * Klares Indigo. Eine einzige Akzentfarbe fuer die ganze App; Farbe ist
 * Aktion und Status vorbehalten, nicht Dekoration.
 *
 * Bewusst gesaettigt: Die Basis traegt den ruhigen Eindruck ueber
 * Schwarz-Weiss-Kontrast, nicht ueber blasse Farbe. Ein entsaettigter Akzent
 * macht die Oberflaeche nicht professionell, sondern nur kraftlos.
 */
const ACCENT = {
  50: '#EEF2FF',
  100: '#E0E7FF',
  200: '#C7D2FE',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5',
  700: '#4338CA',
  800: '#3730A3',
};

/* ------------------------------------------------------------------ *
 * Paletten
 * ------------------------------------------------------------------ */

export const LIGHT = {
  // Flaechen
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F5',
  sheetBg: '#FFFFFF',
  inputBg: '#FFFFFF',

  // Linien -- deutlich sichtbar. Eine Kante, die man nicht sieht, gibt der
  // Oberflaeche keine Struktur, sie macht sie nur unscharf.
  border: '#D4D4D8',
  borderStrong: '#A1A1AA',

  // Text -- Nahezu-Schwarz statt Mittelgrau. Der Kontrast traegt den
  // professionellen Eindruck, nicht die Entsaettigung.
  text: '#09090B',
  textSub: '#3F3F46',
  textMuted: '#71717A',

  // Akzent
  accent: ACCENT[600],
  accentPressed: ACCENT[700],
  accentSurface: ACCENT[50],
  accentBorder: ACCENT[200],
  onAccent: '#FFFFFF',

  // Semantik
  danger: '#DC2626',
  onDanger: '#FFFFFF',
  dangerSurface: '#FEF2F2',
  success: '#15803D',
  successSurface: '#F0FDF4',
  warning: '#B45309',
  warningSurface: '#FFFBEB',

  // Chrome
  overlay: 'rgba(9,9,11,0.5)',
  tabBar: '#FFFFFF',
  tabBorder: '#E4E4E7',
  handle: '#D4D4D8',
  shadow: '#09090B',

  /** @deprecated Alias auf `shadow`, nur fuer noch nicht migrierte Screens. */
  cardShadow: '#09090B',
  isDark: false,
};

export const DARK: typeof LIGHT = {
  // Echtes Schwarz als Basis statt blaeulichem Anthrazit.
  bg: '#09090B',
  surface: '#18181B',
  surfaceAlt: '#27272A',
  sheetBg: '#18181B',
  inputBg: '#09090B',

  border: '#3F3F46',
  borderStrong: '#52525B',

  text: '#FAFAFA',
  textSub: '#A1A1AA',
  textMuted: '#71717A',

  // Im Dark Mode invertiert der Akzent: heller Ton, dunkler Text darauf.
  // Das ist der Trick, mit dem eine einzige Akzentfarbe beide Modi bedient.
  accent: ACCENT[400],
  accentPressed: ACCENT[300],
  accentSurface: 'rgba(129,140,248,0.18)',
  accentBorder: 'rgba(129,140,248,0.45)',
  onAccent: '#09090B',

  danger: '#F87171',
  onDanger: '#09090B',
  dangerSurface: 'rgba(248,113,113,0.18)',
  success: '#4ADE80',
  successSurface: 'rgba(74,222,128,0.18)',
  warning: '#FBBF24',
  warningSurface: 'rgba(251,191,36,0.18)',

  overlay: 'rgba(0,0,0,0.7)',
  tabBar: '#18181B',
  tabBorder: '#27272A',
  handle: '#52525B',
  shadow: '#000000',

  cardShadow: '#000000',
  isDark: true,
};

export type Palette = typeof LIGHT;

/* ------------------------------------------------------------------ *
 * Typografie
 * ------------------------------------------------------------------ */

/**
 * Inter-Schnitte, geladen in App.tsx.
 *
 * WICHTIG: Das Gewicht kommt ueber den Familiennamen, nicht ueber
 * `fontWeight`. Sobald eine `fontFamily` gesetzt ist, ist `fontWeight` auf
 * Android wirkungslos und erzeugt auf iOS Fake-Bold -- deshalb taucht
 * `fontWeight` in dieser Skala bewusst nicht auf.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const typography = {
  display: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 32 },
  title: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 28 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: MONO, fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type Typography = typeof typography;

/* ------------------------------------------------------------------ *
 * Elevation (modusabhaengig)
 * ------------------------------------------------------------------ */

/**
 * Schatten sind auf dunklem Grund unsichtbar. Im Dark Mode traegt deshalb
 * eine Hairline-Kante die Trennung, nicht der Schatten.
 *
 * `shadowColor` ist immer die Schattenfarbe der Palette, nie ein Akzent --
 * farbige Glow-Schatten sind das staerkste "verspielt"-Signal.
 */
/**
 * WICHTIG: Beide Modi liefern denselben Satz an Property-Keys.
 *
 * Vorher hatte der Dark Mode `borderWidth`/`borderColor` und der Light Mode
 * `shadow*`. Faellt ein Key beim Moduswechsel komplett weg, statt auf einen
 * Nullwert gesetzt zu werden, raeumt React Native ihn nicht zuverlaessig ab
 * (insbesondere mit newArchEnabled) -- die Dark-Mode-Kante blieb dann im
 * Light Mode als Geisterrand stehen. Deshalb wird hier immer alles gesetzt.
 */
const ELEVATION_KEYS: ViewStyle = {
  borderWidth: 0,
  borderTopWidth: 0,
  borderColor: 'transparent',
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export function makeElevation(p: Palette) {
  if (p.isDark) {
    const hairline: ViewStyle = {
      ...ELEVATION_KEYS,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    };
    return {
      e1: hairline,
      e2: hairline,
      e3: { ...ELEVATION_KEYS, borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.border },
    } satisfies Record<string, ViewStyle>;
  }
  // Im Light Mode traegt eine sichtbare Kante die Abgrenzung, der Schatten
  // gibt nur Tiefe. Ein 5%-Schatten ohne Kante liest sich als Unschaerfe,
  // nicht als Struktur.
  return {
    e1: {
      ...ELEVATION_KEYS,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      shadowColor: p.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    e2: {
      ...ELEVATION_KEYS,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      shadowColor: p.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    // Sheets werfen nach oben.
    e3: {
      ...ELEVATION_KEYS,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      shadowColor: p.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 16,
    },
  } satisfies Record<string, ViewStyle>;
}

export type Elevation = ReturnType<typeof makeElevation>;

/* ------------------------------------------------------------------ *
 * Nutzerdaten-Paletten
 * ------------------------------------------------------------------ */

/**
 * Vorschlagsfarben fuer Listen und Tags. Das sind Nutzerdaten -- bereits
 * vergebene Farben liegen in der DB und bleiben unangetastet; diese Paletten
 * gelten nur fuer neue Eintraege. Gedaempft, damit sie als Tint funktionieren
 * und nicht als Vollflaeche.
 */
export const LIST_COLORS = [
  '#4F46E5', // Indigo
  '#0284C7', // Blau
  '#059669', // Gruen
  '#D97706', // Amber
  '#DC2626', // Rot
  '#7C3AED', // Violett
  '#DB2777', // Pink
  '#0D9488', // Teal
];

export const TAG_COLORS = [
  '#DC2626',
  '#0D9488',
  '#0284C7',
  '#EA580C',
  '#059669',
  '#CA8A04',
  '#7C3AED',
  '#2563EB',
];

/**
 * Tint-Hintergrund aus einer Nutzerfarbe (Avatar, Badge, Chip).
 *
 * 18% statt der frueheren 12% -- darunter verschwindet die Farbe, die der
 * Nutzer bewusst vergeben hat, praktisch im Hintergrund.
 */
export function tint(hex: string, alpha = '2E') {
  return `${hex}${alpha}`;
}
