import { DarkTheme, DefaultTheme, useTheme as useThemeBase } from '@react-navigation/native';
import { Appearance } from 'react-native';

// Primitive palette: raw color values, each declared exactly once.
// The semantic tokens below alias these, so a value change happens in one place
// while every token stays independently themeable. Names describe hue + lightness
// (higher number = darker); they are deliberately not tied to any component.
const palette = {
  white: '#FFFFFF',
  black: '#000000',

  gray50: '#F5F5F7',
  gray100: '#EEF0F4',
  gray150: '#EEEEEE',
  gray200: '#E6E4E4',
  gray300: '#D2D2D2',
  gray400: '#9AA0AA',
  gray450: '#99A1AF',
  gray500: '#81868E',
  gray800: '#3A3A3C',
  gray850: '#313030',
  gray900: '#202020',
  gray950: '#121212',
  maroon900: '#5A4E4E',

  violet50: '#F6F5FD',
  violet100: '#E6E2FA',
  violet200: '#D0C0FAFF',
  violet500: '#8763EB',
  violet600: '#754CE8',
  violet850: '#473F71',
  violet900: '#1D1A2B',
  violet500Alpha: '#8763EB8F',

  blue500: '#0A84FF',
  teal500: '#37C0A1',
  green500: '#00A63E',
  orange400: '#F38C47',
  pink200: '#F8D2D2',
  red600: '#D0021B',
};

export const ShroudDefaultTheme = {
  ...DefaultTheme,
  closeImage: require('../img/close.png'),
  barStyle: 'dark-content',
  colors: {
    ...DefaultTheme.colors,
    brandingColor: palette.white,
    customHeader: palette.white,
    foregroundColor: '#0C2550',
    buttonBackgroundColor: palette.violet600,
    buttonTextColor: palette.white,
    secondButtonTextColor: '#50555C',
    buttonAlternativeTextColor: palette.white,
    buttonDisabledBackgroundColor: palette.gray100,
    buttonDisabledTextColor: palette.gray400,
    inputBorderColor: palette.gray300,
    inputBackgroundColor: '#F5F5F5',
    alternativeTextColor: palette.gray400,
    alternativeTextColor2: palette.violet600,
    buttonGrayBackgroundColor: palette.gray150,
    incomingBackgroundColor: '#D2F8D6',
    successColor: palette.teal500,
    warningColor: '#F5A623',
    placeholderTextColor: palette.gray500,
    shadowColor: palette.black,
    inverseForegroundColor: palette.white,
    hdborderColor: '#68BBE1',
    background: palette.white,
    lightButton: palette.gray100,
    lightBorder: '#EDEDED',
    ballOutgoingExpired: '#ECF1F7',
    modal: palette.white,
    formBorder: palette.gray300,
    darkGray: palette.gray400,
    scanLabel: palette.gray400,
    feeText: palette.gray500,
    feeLabel: palette.violet200,
    feeValue: palette.violet600,
    labelText: palette.gray500,
    elevated: palette.white,
    mainColor: palette.violet600,
    success: palette.violet600,
    successCheck: palette.green500,
    redBG: palette.pink200,
    redText: palette.red600,
    changeBackground: '#FDF2DA',
    changeText: palette.orange400,
    receiveBackground: '#D1F9D6',
    receiveText: palette.teal500,
    navigationBarColor: palette.white,
    androidRippleColor: '#CCCCCC',
    primary: palette.violet600,

    // --- Revamp design tokens (Sync/scan UI) ---
    // Light-only by design; dark mode inherits these light values via the spread in ShroudDarkTheme.
    // Dedicated keys (not the React Navigation reserved primary/text/border) so DarkTheme can't recolor them.
    brandPrimary: palette.violet600,
    statusPaused: '#9792A6',
    statusSuccess: '#55B685',
    statusError: palette.red600,
    surfaceSubtle: palette.violet50, // banner / card background
    accentSubtle: palette.violet100, // banner & card border, "check again" button bg, scanning icon ring
    surfaceCaution: '#FDFBF5', // caution banner background (address-reuse warning)
    iconCaution: '#F1AF63', // caution banner icon (warm amber)
    segmentTrack: '#F8F8FA', // pill toggle track background
    segmentTrackBorder: palette.gray150, // pill toggle track border
    segmentSelectedBg: palette.white, // selected pill background
    segmentSelectedBorder: '#CFCFCF', // selected pill border
    qrCardBg: '#F9FAFB', // QR code card background
    copyHint: palette.gray450, // "tap to copy" icon + label
    progressTrack: '#EAECF0',
    buttonBorder: '#EBEBEB',
    textPrimary: '#1A1A1A', // titles, primary copy
    textSecondary: '#8E8E93', // subtitles, privacy copy
    textMeta: '#92929B', // ETA / "%" meta text
    textMuted: '#7B7A7E', // card row labels
    chevron: '#C7C7CC', // disclosure chevron
    white: palette.white,
    black: palette.black, // large emphasis numerals
    // SyncStatusIcon per-status ring/fill tints (glyph color = brandPrimary / status* above)
    syncFillScanning: '#DCD2F9',
    syncRingPaused: '#EEEEF1',
    syncFillPaused: '#E4E2E8',
    syncRingDone: '#E2FAEA',
    syncFillDone: '#D2F9DC',
    syncRingError: '#FDF1F2',
    syncFillError: '#FBE9EB',
    // Legacy / existing tokens (keep for compatibility)
    receiveBtnBackground: '#EAE4FB',
    bannerBackground: palette.violet50,
    payBtnDisabledBackground: '#00000052',
    requestBtnTextColor: palette.violet600,
    requestBtnBorderColor: palette.violet600,
    payBtnTextColor: palette.white,
    bannerBorderColor: palette.violet100,
    scanBtnBorderColor: palette.violet100,
    settingsBtnBackground: '#F6F7F9',
    settingsBtnIconColor: '#545454',
    searchIconBackground: palette.white,
    searchIconStroke: palette.violet600,
    shieldIconBackground: '#FAF5FF',
    shieldIconBorder: '#F3E8FF',
    shieldIconAccent: palette.violet600,
    shareAddrBorderColor: palette.violet100,
    shareAddrBackground: 'transparent',
    zeroBalanceRequestTextColor: palette.white,
    cardBackground: '#FDFCFE',

    // --- Send redesign tokens (light-only; dark mode is not yet wired up in NavigationContainer) ---
    fieldBackground: palette.gray50, // Address / Note field background
    amountMeta: '#9B9BA5', // BTC unit, fiat estimate, slow/medium ETA
    amountPlaceholder: 'rgba(0,0,0,0.32)', // AmountHero empty/placeholder digits
    scrim: 'rgba(10, 13, 19, 0.8)', // Success bottom-sheet backdrop
    ctaDisabled: palette.gray450, // disabled primary button background
    feeCardBorder: '#E6E6E8', // unselected fee card border
    feeCardSelectedBorder: '#B9BAF9', // selected fee card border
    useMaxBorder: '#E8E4FA', // "Use Max" pill border
    useMaxText: '#6E55E0', // "Use Max" pill text
    copyButtonBorder: palette.gray200, // Confirm copy-button border
    divider: palette.gray200, // Confirm section dividers
    summaryBorder: palette.gray200, // SendDetails fee summary card border
    transactionCardBorder: palette.gray200,
    txIconHaloBorder: palette.violet100,
    incomingIconBackground: '#E7E6F5',
    incomingIconBorder: palette.violet100,
    outgoingIconBackground: palette.gray50,
    outgoingIconBorder: '#D9D9D9',
  },
};

export type Theme = typeof ShroudDefaultTheme;

export const ShroudDarkTheme: Theme = {
  ...DarkTheme,
  closeImage: require('../img/close-white.png'),
  barStyle: 'light-content',
  colors: {
    ...ShroudDefaultTheme.colors,
    ...DarkTheme.colors,
    customHeader: palette.gray950,
    brandingColor: palette.black,
    background: palette.gray950,
    brandPrimary: palette.violet500,
    foregroundColor: palette.white,
    buttonDisabledBackgroundColor: palette.gray800,
    buttonBackgroundColor: palette.violet600,
    buttonTextColor: palette.white,
    lightButton: 'rgba(255,255,255,.1)',
    buttonAlternativeTextColor: palette.white,
    alternativeTextColor: palette.gray400,
    alternativeTextColor2: palette.blue500,
    lightBorder: palette.gray850,
    ballOutgoingExpired: palette.gray900,
    modal: palette.gray900,
    formBorder: palette.gray900,
    inputBackgroundColor: '#262626',
    darkGray: palette.gray800,
    feeText: palette.gray500,
    feeLabel: palette.violet200,
    feeValue: palette.violet600,
    elevated: palette.gray950,
    mainColor: palette.blue500,
    success: palette.gray900,
    successCheck: palette.green500,
    scanLabel: 'rgba(255,255,255,.2)',
    labelText: palette.white,
    redBG: palette.maroon900,
    redText: '#FC6D6D',
    changeBackground: palette.maroon900,
    changeText: palette.orange400,
    receiveBackground: 'rgba(210,248,214,.2)',
    receiveText: palette.teal500,
    navigationBarColor: palette.gray800,
    androidRippleColor: '#444444',
    receiveBtnBackground: '#110732',
    bannerBackground: palette.violet900,
    payBtnDisabledBackground: '#FFFFFF52',
    requestBtnTextColor: palette.violet500,
    requestBtnBorderColor: palette.violet500Alpha,
    payBtnTextColor: palette.white,
    bannerBorderColor: '#2D264F',
    scanBtnBorderColor: '#241F3B',
    settingsBtnBackground: '#141414',
    settingsBtnIconColor: '#AAAAAA',
    searchIconBackground: '#0D0D0D',
    searchIconStroke: palette.violet500,
    shieldIconBackground: palette.violet900,
    shieldIconBorder: '#181818',
    shieldIconAccent: palette.violet500,
    shareAddrBorderColor: palette.violet500Alpha,
    shareAddrBackground: palette.violet900,
    cardBackground: '#1A1A1A',
    transactionCardBorder: palette.gray850,
    txIconHaloBorder: palette.violet850,
    incomingIconBackground: '#322361',
    incomingIconBorder: palette.violet850,
    outgoingIconBackground: '#161616',
    outgoingIconBorder: palette.violet850,
  },
};

// Casting theme value to get autocompletion
export const useTheme = (): Theme => useThemeBase() as Theme;

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
