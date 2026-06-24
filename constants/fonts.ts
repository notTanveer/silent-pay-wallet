/**
 * Clash Grotesk font family names, as registered by the native font assets
 * (see assets/fonts and react-native.config.js). On iOS the family name
 * resolves to the font's PostScript name; on Android it resolves by filename
 * (sans extension). Reference a specific weight via `fontFamily` and avoid
 * relying on `fontWeight`.
 */
export const ClashFont = {
  regular: 'ClashGrotesk-Regular',
  medium: 'ClashGrotesk-Medium',
  semibold: 'ClashGrotesk-Semibold',
  bold: 'ClashGrotesk-Bold',
} as const;

export type ClashFontWeight = keyof typeof ClashFont;
