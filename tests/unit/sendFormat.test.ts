import { formatFeeOptionSubtitle, computeTotalSats, isAmountEmpty, sanitizeAmountInput } from '../../helpers/send/format';
import { BitcoinUnit } from '../../models/bitcoinUnits';

describe('send/format', () => {
  describe('formatFeeOptionSubtitle', () => {
    it('composes the btc amount, rate and unit', () => {
      expect(formatFeeOptionSubtitle('0.00000714', 7, 'sat/vByte')).toBe('0.00000714 BTC · 7 sat/vByte');
    });
  });

  describe('computeTotalSats', () => {
    it('adds amount and fee', () => {
      expect(computeTotalSats(4000, 511)).toBe(4511);
    });
    it('treats NaN inputs as zero', () => {
      expect(computeTotalSats(NaN, 511)).toBe(511);
      expect(computeTotalSats(4000, NaN)).toBe(4000);
    });
  });

  describe('isAmountEmpty', () => {
    it('is true for undefined, empty, zero, and non-numeric strings', () => {
      expect(isAmountEmpty(undefined)).toBe(true);
      expect(isAmountEmpty('')).toBe(true);
      expect(isAmountEmpty('0')).toBe(true);
      expect(isAmountEmpty(0)).toBe(true);
      expect(isAmountEmpty('.')).toBe(true);
      expect(isAmountEmpty(',')).toBe(true);
    });
    it('is false for a positive amount and for MAX', () => {
      expect(isAmountEmpty('0.0001')).toBe(false);
      expect(isAmountEmpty('MAX')).toBe(false);
    });
  });

  describe('sanitizeAmountInput', () => {
    it('keeps digits and a single dot in BTC mode, dropping extras', () => {
      expect(sanitizeAmountInput('0.0000344', BitcoinUnit.BTC)).toBe('0.0000344');
      expect(sanitizeAmountInput('abc1.2.3', BitcoinUnit.BTC)).toBe('1.23');
      expect(sanitizeAmountInput('1,000.5', BitcoinUnit.BTC)).toBe('1000.5');
    });
    it('keeps digits only in sats mode, dropping dots and separators', () => {
      expect(sanitizeAmountInput('3440', BitcoinUnit.SATS)).toBe('3440');
      expect(sanitizeAmountInput('3,440 sats', BitcoinUnit.SATS)).toBe('3440');
      expect(sanitizeAmountInput('0.5', BitcoinUnit.SATS)).toBe('05');
    });
    it('returns empty string for empty input in either unit', () => {
      expect(sanitizeAmountInput('', BitcoinUnit.BTC)).toBe('');
      expect(sanitizeAmountInput('', BitcoinUnit.SATS)).toBe('');
    });
  });
});
