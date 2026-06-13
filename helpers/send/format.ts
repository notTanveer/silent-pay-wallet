import { BitcoinUnit } from '../../models/bitcoinUnits';

/** Pure formatting/derivation helpers for the send flow. No React, no I/O. */

/** "0.00000714 BTC · 7 sat/vByte" */
export const formatFeeOptionSubtitle = (btcAmount: string, rate: number, unitLabel: string): string =>
  `${btcAmount} BTC · ${rate} ${unitLabel}`;

/** Sum of send amount and fee in sats; NaN inputs are treated as 0. */
export const computeTotalSats = (amountSats: number, feeSats: number): number =>
  (Number.isNaN(amountSats) ? 0 : amountSats) + (Number.isNaN(feeSats) ? 0 : feeSats);

/** True when the amount is unset/zero. 'MAX' is NOT empty. */
export const isAmountEmpty = (amount?: string | number): boolean => {
  if (amount === undefined || amount === null) return true;
  if (amount === 'MAX') return false;
  const n = Number(amount);
  return Number.isNaN(n) || n === 0;
};

/**
 * Strips a raw amount input to the valid character set for the given unit.
 * BTC: digits plus at most one decimal point. SATS: digits only.
 */
export const sanitizeAmountInput = (text: string, unit: BitcoinUnit): string => {
  if (unit === BitcoinUnit.SATS) {
    return text.replace(/[^0-9]/g, '');
  }
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [intPart, ...rest] = cleaned.split('.');
  return rest.length ? `${intPart}.${rest.join('')}` : intPart;
};
