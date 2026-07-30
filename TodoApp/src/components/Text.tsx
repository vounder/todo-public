import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * Drop-in-Ersatz fuer `Text` aus react-native.
 *
 * React Native vererbt keine Schriftart -- ohne das hier muesste jede der
 * ~600 Text-Stellen einzeln eine `fontFamily` bekommen. Stattdessen tauscht
 * ein Screen bei der Migration eine einzige Importzeile:
 *
 *   import { Text } from 'react-native';   ->   import { Text } from '../components';
 *
 * und die ganze Datei bekommt Inter plus eine sinnvolle Default-Textfarbe.
 * Bewusste Typografie kommt weiterhin aus `t.type.*`.
 *
 * Kein `Text.defaultProps`: das klassische RN-Rezept ist unter React 19
 * kaputt, weil defaultProps auf Function Components entfaellt.
 */
export function Text({ style, ...props }: RNTextProps) {
  const { colors, type } = useTheme();
  return <RNText {...props} style={[{ fontFamily: type.body.fontFamily, color: colors.text }, style]} />;
}
