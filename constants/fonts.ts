/**
 * Clash Grotesk font family names, as registered by the native font assets
 * (see assets/fonts and react-native.config.js). On both iOS and Android the
 * family name resolves to the font's PostScript name, so reference a specific
 * weight via `fontFamily` and avoid relying on `fontWeight`.
 */
export const ClashFont = {
  regular: 'ClashGrotesk-Regular',
  medium: 'ClashGrotesk-Medium',
  semibold: 'ClashGrotesk-Semibold',
  bold: 'ClashGrotesk-Bold',
} as const;

export type ClashFontWeight = keyof typeof ClashFont;
