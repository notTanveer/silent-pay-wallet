import { DarkTheme, DefaultTheme, useTheme as useThemeBase } from '@react-navigation/native';
import { Appearance } from 'react-native';

export const ShroudDefaultTheme = {
  ...DefaultTheme,
  closeImage: require('../img/close.png'),
  barStyle: 'dark-content',
  colors: {
    ...DefaultTheme.colors,
    borderWidth: 0.5,
    brandingColor: '#ffffff',
    customHeader: '#ffffff',
    foregroundColor: '#0c2550',
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    buttonBackgroundColor: '#754CE8',
    buttonTextColor: '#ffffff',
    secondButtonTextColor: '#50555C',
    buttonAlternativeTextColor: '#ffffff',
    buttonDisabledBackgroundColor: '#eef0f4',
    buttonDisabledTextColor: '#9aa0aa',
    inputBorderColor: '#d2d2d2',
    inputBackgroundColor: '#f5f5f5',
    alternativeTextColor: '#9aa0aa',
    alternativeTextColor2: '#754CE8',
    buttonBlueBackgroundColor: '#ccddf9',
    buttonGrayBackgroundColor: '#EEEEEE',
    incomingBackgroundColor: '#d2f8d6',
    incomingForegroundColor: '#37c0a1',
    outgoingBackgroundColor: '#f8d2d2',
    outgoingForegroundColor: '#d0021b',
    successColor: '#37c0a1',
    failedColor: '#ff0000',
    warningColor: '#F5A623',
    placeholderTextColor: '#81868e',
    shadowColor: '#000000',
    inverseForegroundColor: '#ffffff',
    hdborderColor: '#68BBE1',
    hdbackgroundColor: '#ECF9FF',
    lnborderColor: '#FFB600',
    lnbackgroundColor: '#FFFAEF',
    background: '#FFFFFF',
    lightButton: '#eef0f4',
    ballReceive: '#d2f8d6',
    ballOutgoing: '#f8d2d2',
    lightBorder: '#ededed',
    ballOutgoingExpired: '#ECF1F7',
    modal: '#ffffff',
    formBorder: '#d2d2d2',
    modalButton: '#ccddf9',
    darkGray: '#9AA0AA',
    scanLabel: '#9AA0AA',
    feeText: '#81868e',
    feeLabel: '#d0c0faff',
    feeValue: '#754CE8',
    feeActive: '#d0c0faff',
    labelText: '#81868e',
    cta2: '#062453',
    outputValue: '#13244D',
    elevated: '#ffffff',
    mainColor: '#754CE8',
    success: '#754CE8',
    successCheck: '#00A63E',
    msSuccessBG: '#37c0a1',
    msSuccessCheck: '#ffffff',
    newBlue: '#007AFF',
    redBG: '#F8D2D2',
    redText: '#D0021B',
    changeBackground: '#FDF2DA',
    changeText: '#F38C47',
    receiveBackground: '#D1F9D6',
    receiveText: '#37C0A1',
    navigationBarColor: '#FFFFFF',
    androidRippleColor: '#CCCCCC',
    primary: '#754CE8',
    secondary: '#472EBF',

    // --- Revamp design tokens (Sync/scan UI) ---
    // Light-only by design; dark mode inherits these light values via the spread in ShroudDarkTheme.
    // Dedicated keys (not the React Navigation reserved primary/text/border) so DarkTheme can't recolor them.
    brandPrimary: '#754CE8',
    statusPaused: '#9792A6',
    statusSuccess: '#55B685',
    statusError: '#D0021B',
    surfaceSubtle: '#F6F5FD', // banner / card background
    accentSubtle: '#E6E2FA', // banner & card border, "check again" button bg, scanning icon ring
    segmentTrack: '#F8F8FA', // pill toggle track background
    segmentTrackBorder: '#EEEEEE', // pill toggle track border
    segmentSelectedBg: '#FFFFFF', // selected pill background
    segmentSelectedBorder: '#CFCFCF', // selected pill border
    qrCardBg: '#F9FAFB', // QR code card background
    copyHint: '#99A1AF', // "tap to copy" icon + label
    progressTrack: '#EAECF0',
    buttonBorder: '#EBEBEB',
    textPrimary: '#1A1A1A', // titles, primary copy
    textSecondary: '#8E8E93', // subtitles, privacy copy
    textMeta: '#92929B', // ETA / "%" meta text
    textMuted: '#7B7A7E', // card row labels
    chevron: '#C7C7CC', // disclosure chevron
    white: '#FFFFFF',
    black: '#000000', // large emphasis numerals
    // SyncStatusIcon per-status ring/fill tints (glyph color = brandPrimary / status* above)
    syncFillScanning: '#DCD2F9',
    syncRingPaused: '#EEEEF1',
    syncFillPaused: '#E4E2E8',
    syncRingDone: '#E2FAEA',
    syncFillDone: '#D2F9DC',
    syncRingError: '#FDF1F2',
    syncFillError: '#FBE9EB',
  },
};

export type Theme = typeof ShroudDefaultTheme;

const ShroudDarkTheme: Theme = {
  ...DarkTheme,
  closeImage: require('../img/close-white.png'),
  barStyle: 'light-content',
  colors: {
    ...ShroudDefaultTheme.colors,
    ...DarkTheme.colors,
    customHeader: '#000000',
    brandingColor: '#000000',
    borderTopColor: '#9aa0aa',
    background: '#000000',
    foregroundColor: '#ffffff',
    buttonDisabledBackgroundColor: '#3A3A3C',
    buttonBackgroundColor: '#FF9500',
    buttonTextColor: '#ffffff',
    lightButton: 'rgba(255,255,255,.1)',
    buttonAlternativeTextColor: '#ffffff',
    alternativeTextColor: '#9aa0aa',
    alternativeTextColor2: '#0A84FF',
    ballReceive: '#202020',
    ballOutgoing: '#202020',
    lightBorder: '#313030',
    ballOutgoingExpired: '#202020',
    modal: '#202020',
    formBorder: '#202020',
    inputBackgroundColor: '#262626',
    modalButton: '#000000',
    darkGray: '#3A3A3C',
    feeText: '#81868e',
    feeLabel: '#d0c0faff',
    feeValue: '#754CE8',
    feeActive: '#d0c0faff',
    cta2: '#ffffff',
    outputValue: '#ffffff',
    elevated: '#121212',
    mainColor: '#0A84FF',
    success: '#202020',
    successCheck: '#00A63E',
    buttonBlueBackgroundColor: '#202020',
    scanLabel: 'rgba(255,255,255,.2)',
    labelText: '#ffffff',
    msSuccessBG: '#8EFFE5',
    msSuccessCheck: '#000000',
    newBlue: '#007AFF',
    redBG: '#5A4E4E',
    redText: '#FC6D6D',
    changeBackground: '#5A4E4E',
    changeText: '#F38C47',
    receiveBackground: 'rgba(210,248,214,.2)',
    receiveText: '#37C0A1',
    navigationBarColor: '#3A3A3C',
    androidRippleColor: '#444444',
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
