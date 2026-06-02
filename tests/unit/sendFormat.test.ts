import { formatFeeOptionSubtitle, computeTotalSats, isAmountEmpty } from '../../helpers/send/format';

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
    it('is true for undefined, empty, and zero', () => {
      expect(isAmountEmpty(undefined)).toBe(true);
      expect(isAmountEmpty('')).toBe(true);
      expect(isAmountEmpty('0')).toBe(true);
      expect(isAmountEmpty(0)).toBe(true);
    });
    it('is false for a positive amount and for MAX', () => {
      expect(isAmountEmpty('0.0001')).toBe(false);
      expect(isAmountEmpty('MAX')).toBe(false);
    });
  });
});
