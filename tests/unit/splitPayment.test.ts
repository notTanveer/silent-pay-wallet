import {
  computeSplitCount,
  splitAmount,
  SPLIT_MIN_OUTPUT_SATS,
  economicFloor,
  FLOOR_K,
  SPEND_INPUT_VBYTES,
  maxFeasibleCount,
  pickCount,
  SPLIT_MAX_OUTPUTS,
  logUniformPartition,
  deRound,
  SPLIT_ROUND_MODULUS,
  planChangeOutputs,
} from '../../helpers/silent-payments/splitPayment';

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

  it('returns 4 at 350k sats (half-up rounding)', () => {
    // Math.round(3.5) = 4 in JS; pins this behaviour
    expect(computeSplitCount(350_000)).toBe(4);
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

  it('throws when totalSats is too small for n outputs', async () => {
    await expect(splitAmount(30_000, 2)).rejects.toThrow('totalSats too small');
  });
});

// deterministic rng: every byte = value (default 0) so jitter is reproducible
const fixedRng = (value = 0) => async (size: number) => Buffer.alloc(size, value);

describe('economicFloor', () => {
  it('is at least the absolute minimum at low fee rates', async () => {
    const floor = await economicFloor(1, fixedRng(0));
    expect(floor).toBeGreaterThanOrEqual(SPLIT_MIN_OUTPUT_SATS);
  });

  it('scales with fee rate above the minimum', async () => {
    const floor = await economicFloor(100, fixedRng(0)); // FLOOR_K * 58 * 100 = 17400... but >= MIN
    expect(floor).toBeGreaterThanOrEqual(FLOOR_K * SPEND_INPUT_VBYTES * 100);
  });

  it('adds bounded jitter (<= 10% of base) above the floor', async () => {
    const base = await economicFloor(50, fixedRng(0));       // jitter byte 0 -> jitter 0
    const jittered = await economicFloor(50, fixedRng(0xff)); // max jitter
    expect(jittered).toBeGreaterThanOrEqual(base);
    expect(jittered - base).toBeLessThanOrEqual(Math.ceil(0.1 * base) + 1);
  });
});

describe('maxFeasibleCount', () => {
  it('caps at SPLIT_MAX_OUTPUTS for large amounts', () => {
    expect(maxFeasibleCount(10_000_000, 25_000)).toBe(SPLIT_MAX_OUTPUTS);
  });
  it('is limited by floor for small amounts', () => {
    expect(maxFeasibleCount(60_000, 25_000)).toBe(2); // floor(60000/25000) = 2
  });
  it('can be below 2 (not splittable) for tiny amounts', () => {
    expect(maxFeasibleCount(30_000, 25_000)).toBe(1);
  });
});

describe('pickCount', () => {
  it('returns a value within [2, maxFeasible]', async () => {
    for (let trial = 0; trial < 50; trial++) {
      const n = await pickCount(450_000, 25_000); // maxFeasible = 5
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
  it('does not derive the count deterministically from the amount', async () => {
    const counts = new Set<number>();
    for (let trial = 0; trial < 50; trial++) {
      counts.add(await pickCount(1_000_000, 25_000)); // maxFeasible = 5
    }
    expect(counts.size).toBeGreaterThan(1); // randomized, not a fixed function of V
  });
});

describe('logUniformPartition', () => {
  it('returns exactly n parts summing to total, each >= floor', async () => {
    for (let trial = 0; trial < 30; trial++) {
      const parts = await logUniformPartition(500_000, 4, 25_000);
      expect(parts).toHaveLength(4);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(500_000);
      for (const p of parts) expect(p).toBeGreaterThanOrEqual(25_000);
    }
  });

  it('returns whole-sat integers', async () => {
    const parts = await logUniformPartition(123_457, 3, 25_000);
    for (const p of parts) expect(Number.isInteger(p)).toBe(true);
  });

  it('spreads amounts (not a tight uniform cluster) across trials', async () => {
    let sawSpread = false;
    for (let trial = 0; trial < 30 && !sawSpread; trial++) {
      const parts = await logUniformPartition(1_000_000, 4, 25_000);
      const max = Math.max(...parts);
      const min = Math.min(...parts);
      if (max / min > 2) sawSpread = true; // log-uniform produces real spread
    }
    expect(sawSpread).toBe(true);
  });

  it('throws when total is too small for n parts above floor', async () => {
    await expect(logUniformPartition(40_000, 2, 25_000)).rejects.toThrow('too small');
  });
});

describe('deRound', () => {
  it('removes round values while preserving the exact sum', async () => {
    const input = [100_000, 73_321]; // first is round (divisible by 1000)
    const out = await deRound(input, 25_000);
    expect(out.reduce((a, b) => a + b, 0)).toBe(173_321);
    expect(out[0] % SPLIT_ROUND_MODULUS).not.toBe(0);
  });

  it('keeps every element >= floor', async () => {
    const input = [50_000, 50_000, 50_000];
    const out = await deRound(input, 25_000);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(25_000);
    expect(out.reduce((a, b) => a + b, 0)).toBe(150_000);
  });

  it('returns single-element arrays unchanged (cannot compensate)', async () => {
    const out = await deRound([100_000], 25_000);
    expect(out).toEqual([100_000]);
  });
});

describe('planChangeOutputs', () => {
  const common = { floor: 25_000, feeRate: 1, paymentCount: 3 };

  it('drops change below dust (returns empty)', async () => {
    const out = await planChangeOutputs({ ...common, change: 100, pMax: 80_000 });
    expect(out).toEqual([]);
  });

  it('returns a single in-distribution change output when change <= pMax', async () => {
    const out = await planChangeOutputs({ ...common, change: 60_000, pMax: 80_000 });
    expect(out).toHaveLength(1);
    // single change is reduced only by the extra-output fee, not partitioned
    expect(out[0]).toBeLessThanOrEqual(60_000);
    expect(out[0]).toBeGreaterThan(0);
  });

  it('splits change into multiple in-range pieces when change is an outlier', async () => {
    const out = await planChangeOutputs({ ...common, change: 1_000_000, pMax: 80_000 });
    expect(out.length).toBeGreaterThan(1);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(25_000);
  });

  it('accounts for the extra-output fee in the distributed total', async () => {
    const change = 1_000_000;
    const feeRate = 10;
    const out = await planChangeOutputs({ ...common, change, feeRate, pMax: 80_000 });
    const distributed = out.reduce((a, b) => a + b, 0);
    expect(distributed).toBeLessThan(change); // fee for added outputs came out of change
  });
});
