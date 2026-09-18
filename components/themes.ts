import { DarkTheme, DefaultTheme, useTheme as useThemeBase } from '@react-navigation/native';
import { Appearance, ColorSchemeName } from 'react-native';
import { ThemePreference } from './Context/SettingsProvider';

export const palette = {
  neutral0: '#FFFFFF',
  neutral0Alpha08: '#FFFFFF14',
  neutral50: '#F5F5F7',
  neutral100: '#E6E4E4',
  neutral100Alpha60: '#E6E4E499',
  neutral200: '#C7C7CC',
  neutral400: '#8E8E93',
  neutral500: '#8888AA',
  neutral600: '#F0F0F5',
  neutral700: '#1E1E2E',
  neutral750: '#1A1A28',
  neutral800: '#1A1A1A',
  neutral900: '#000000',
  neutral900Alpha40: '#00000066',

  purple50: '#FDFCFE',
  purple100: '#F6F5FD',
  purple200: '#EAE4FB',
  purple300: '#E6E2FA',
  purple400: '#6B5CE7',
  purple500: '#754CE8',
  purple600: '#D7C8F7',
  purple700: '#25253A',
  purple800: '#1A1535',
  purple900: '#0E0E16',

  amber100: '#F9EFE6',
  amber400: '#F5C077',
  amber500: '#F1AF63',
  amber800: '#2E2518',

  green100: '#EBF5ED',
  green400: '#66C799',
  green500: '#55B685',
  green800: '#1A2E22',

  red100: '#FCD3CA',
  red400: '#EF4444',
  red500: '#B24334',
  red800: '#2E1A1A',

  bitcoin500: '#F7931A',

  navy900: '#101828',

  avatarBlue: '#E7F0FA',
  avatarPink: '#F7E9EF',

  // NOT in IMPLEMENTATION-REFERENCE.md — avatar text tints
  avatarBlueText: '#3B80F9', // no blue text token exists; reused from the §9 illustration fills
  avatarPinkText: '#AA3F7E', // per-contact avatar tint
};

// Semantic color tokens. Each token declares BOTH schemes, so a token can never
// silently inherit its light value in dark mode — the type requires both.
//   pair(l, d)   different value per scheme
//   same(v)      deliberately identical in both
type ColorToken = { light: string; dark: string };
const pair = (light: string, dark: string): ColorToken => ({ light, dark });
const same = (v: string): ColorToken => ({ light: v, dark: v });

// React Navigation's reserved `card` key paints the native header; without it dark headers keep
// RN's own #121212 and read as a lighter strip above the #0E0E16 screen. It has to track
// `background` exactly, so both keys share one token rather than repeating the pair().
const background = pair(palette.neutral0, palette.purple900);

const tokens = {
  background, // bg/primary
  card: background,
  brandPrimary: pair(palette.purple500, palette.purple400), // surface/brand
  statusSuccess: pair(palette.green500, palette.green400), // text/success + icon/success
  statusError: pair(palette.red500, palette.red400), // text/error + icon/error + border/error
  surfaceSubtle: pair(palette.purple100, palette.purple800), // bg/brand (info card fill)
  accentSubtle: pair(palette.purple300, palette.purple700), // border/brand
  surfaceCaution: pair(palette.amber100, palette.red800), // bg/warning-subtle
  surfaceError: pair(palette.red100, palette.red800), // bg/error
  textWarning: pair(palette.amber500, palette.amber400), // text/warning + icon/warning
  textPrimary: pair(palette.neutral900, palette.neutral600), // text/primary
  textSecondary: pair(palette.neutral800, palette.neutral200), // text/secondary
  textMuted: pair(palette.neutral400, palette.neutral500), // text/muted
  chevron: pair(palette.neutral400, palette.neutral500), // icon/secondary
  iconPrimary: pair(palette.neutral800, palette.neutral600), // icon/primary
  white: same(palette.neutral0),
  black: same(palette.neutral900),

  fieldBackground: pair(palette.neutral50, palette.neutral750), // bg/secondary
  textDisabled: pair(palette.neutral200, palette.neutral700), // text/disabled
  scrim: same(palette.neutral900Alpha40), // overlay @40% (doc §5)
  ctaDisabled: pair(palette.neutral400, palette.neutral700), // bg/disabled
  borderDefault: pair(palette.neutral100Alpha60, palette.neutral0Alpha08), // border/default
  surfaceBrandSubtle: pair(palette.purple50, palette.purple900), // bg/brand-subtle
  surfaceBrandTint: pair(palette.purple200, palette.purple700), // surface/brand-tint
  bgInverse: pair(palette.neutral900, palette.neutral0), // bg/inverse
  borderStrong: pair(palette.neutral200, palette.neutral700), // border/strong (toggle off-track)
  borderInput: pair(palette.neutral100, palette.neutral700), // border/input
  bgSuccess: pair(palette.green100, palette.green800), // bg/success
  textBrand: pair(palette.purple500, palette.purple600), // text/brand
} satisfies Record<string, ColorToken>;

type Scheme = 'light' | 'dark';
const buildColors = (scheme: Scheme): Record<keyof typeof tokens, string> => {
  const out = {} as Record<keyof typeof tokens, string>;
  (Object.keys(tokens) as (keyof typeof tokens)[]).forEach(key => {
    out[key] = tokens[key][scheme];
  });
  return out;
};

export const ShroudDefaultTheme = {
  ...DefaultTheme,
  closeImage: require('../img/close.png'),
  barStyle: 'dark-content',
  colors: {
    ...DefaultTheme.colors,
    ...buildColors('light'),
  },
};

export type Theme = typeof ShroudDefaultTheme;

// Dark spreads the RN base + RN dark reserved keys first, then our dark values on top, so our
// tokens (e.g. `brandPrimary`, purple500/purple400) win over RN's own dark-scheme defaults for
// every key we define. RN's reserved `text`/`border`/`notification` aren't in `tokens` and still
// fall through to DarkTheme.colors, but nothing in the app currently reads them.
export const ShroudDarkTheme: Theme = {
  ...DarkTheme,
  closeImage: require('../img/close-white.png'),
  barStyle: 'light-content',
  colors: {
    ...DefaultTheme.colors,
    ...DarkTheme.colors,
    ...buildColors('dark'),
  },
};

// Casting theme value to get autocompletion
export const useTheme = (): Theme => useThemeBase() as Theme;

// shadow/sm from the design system: a hairline lift off the page, not a drop shadow.
// Not theme-dependent, so it belongs in a static sheet at every call site. Kept here because
// it was previously reimplemented per-component with different offsets and colors.
export const shadowSm = {
  shadowColor: palette.navy900,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 3,
  elevation: 2,
} as const;

// TextInput caret + selection tint. Spread onto any TextInput so the caret follows the wallet's
// brand instead of the platform default: <TextInput {...caretProps(colors)} />
export const caretProps = (colors: Theme['colors']) => ({
  selectionColor: colors.brandPrimary,
  cursorColor: colors.brandPrimary,
});

export const getEffectiveTheme = (themePreference: ThemePreference, colorScheme: ColorSchemeName): Theme => {
  const effectiveScheme = themePreference === 'system' ? colorScheme : themePreference;
  return effectiveScheme === 'dark' ? ShroudDarkTheme : ShroudDefaultTheme;
};

export class BlueCurrentTheme {
  static colors: Theme['colors'];
  static closeImage: Theme['closeImage'];

  static updateColorScheme(): void {
    const isColorSchemeDark = Appearance.getColorScheme() === 'dark';
    BlueCurrentTheme.colors = isColorSchemeDark ? ShroudDarkTheme.colors : ShroudDefaultTheme.colors;
    BlueCurrentTheme.closeImage = isColorSchemeDark ? ShroudDarkTheme.closeImage : ShroudDefaultTheme.closeImage;
  }
}

BlueCurrentTheme.updateColorScheme();

// Keep the static snapshot in sync when the OS appearance changes at runtime.
// Without this, BlueCurrentTheme.colors is frozen at import and consumers that
// read it go stale after a light/dark toggle. Consumers must read the value at
// render time (not bake it into a module-level StyleSheet) to observe the update.
Appearance.addChangeListener(() => BlueCurrentTheme.updateColorScheme());
