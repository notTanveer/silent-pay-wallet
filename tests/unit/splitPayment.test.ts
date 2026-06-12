import { computeSplitCount, splitAmount, SPLIT_MIN_OUTPUT_SATS } from '../../helpers/silent-payments/splitPayment';

describe('computeSplitCount', () => {
  it('returns 1 for amounts below 50k sats', () => {
    expect(computeSplitCount(0)).toBe(1);
    expect(computeSplitCount(49_999)).toBe(1);
  });

  it('returns 2 at exactly 50k sats', () => {
    expect(computeSplitCount(50_000)).toBe(2);
  });

  it('returns 2 at 150k sats (rounds to 2)', () => {
    expect(computeSplitCount(150_000)).toBe(2);
  });

  it('returns 3 at 250k sats', () => {
    expect(computeSplitCount(250_000)).toBe(3);
  });

  it('returns 5 at 450k sats', () => {
    expect(computeSplitCount(450_000)).toBe(5);
  });

  it('caps at 5 beyond 500k sats', () => {
    expect(computeSplitCount(1_000_000)).toBe(5);
    expect(computeSplitCount(10_000_000)).toBe(5);
  });

  it('feasibility clamp: 60k sats → 2 outputs', () => {
    expect(computeSplitCount(60_000)).toBe(2);
  });
});

describe('splitAmount', () => {
  it('returns exactly n values', async () => {
    expect(await splitAmount(200_000, 2)).toHaveLength(2);
    expect(await splitAmount(300_000, 3)).toHaveLength(3);
  });

  it('all values sum exactly to total', async () => {
    for (let trial = 0; trial < 20; trial++) {
      const total = 500_000;
      const parts = await splitAmount(total, 3);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('each value is >= SPLIT_MIN_OUTPUT_SATS', async () => {
    for (let trial = 0; trial < 20; trial++) {
      const parts = await splitAmount(300_000, 3);
      for (const p of parts) {
        expect(p).toBeGreaterThanOrEqual(SPLIT_MIN_OUTPUT_SATS);
      }
    }
  });

  it('each value is a whole number of sats', async () => {
    const parts = await splitAmount(123_456, 2);
    for (const p of parts) {
      expect(Number.isInteger(p)).toBe(true);
    }
  });
});
