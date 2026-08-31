/**
 * Let's keep config vars, constants and definitions here
 */

export const BIP352_ACTIVATION_HEIGHT = 842579; // May 8, 2024, when BIP-352 was merged

/** A birth height is only meaningful between BIP-352 activation and the current chain tip. */
export const clampBirthHeight = (height: number, tipHeight: number): number =>
  Math.min(Math.max(height, BIP352_ACTIVATION_HEIGHT), tipHeight);
