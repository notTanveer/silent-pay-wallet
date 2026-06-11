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
