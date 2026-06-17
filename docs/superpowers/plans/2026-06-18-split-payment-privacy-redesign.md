# Split Payment Privacy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the silent-payment "split payment" feature so the output count is decoupled from the amount, amounts follow a natural log-uniform distribution, and the change output is blended in — defeating the change-address-detection heuristics from the Bitcoin wiki.

**Architecture:** A pure, unit-tested planner in `helpers/silent-payments/splitPayment.ts` decides the output count and amounts (payments + change). The SP transaction builder in `class/wallets/hd-bip352-wallet.ts` is reordered to coin-select **first**, call the planner with the resulting change amount, derive distinct change addresses, shuffle outputs, and recompute the fee from inputs−outputs. The UI shows an estimated output *range* before build and the exact count on Confirm.

**Tech Stack:** TypeScript, React Native, `bitcoinjs-lib`, `coinselect`, Jest (unit tests in `tests/unit/`), the BIP-352 `silent-payment` library, ESLint + `tsc`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-split-payment-privacy-redesign-design.md` (read it first).
- Randomness MUST come from `randomBytes` in `class/rng` (async, returns `Buffer`). Every randomness-consuming function takes an optional `rng: (size: number) => Promise<Buffer>` defaulting to `randomBytes`, so tests can inject determinism.
- Payment outputs MUST sum to **exactly** the requested payment value `V` (the recipient receives `V`).
- Every output MUST be `≥ economicFloor` (payments and split-change pieces); the absolute lower bound is `SPLIT_MIN_OUTPUT_SATS = 25_000`.
- No output amount may be left on a round value (`amount % 1000 === 0`) **except** a lone change output, whose value is fixed by the transaction balance.
- Constants (exact values): `SPLIT_MAX_OUTPUTS = 5`, `SPLIT_MIN_OUTPUT_SATS = 25_000`, `SPLIT_SPREAD_RATIO = 8`, `FLOOR_K = 3`, `SPEND_INPUT_VBYTES = 58`, `OUTPUT_VBYTES = 43`, `SPLIT_ROUND_MODULUS = 1000`, `DEFAULT_DUST_THRESHOLD = 330`.
- Keep every commit green: `npm run tslint` (tsc) and `npm run unit` must pass. The old `computeSplitCount`/`splitAmount` stay until their importers are migrated; they are removed only in the final cleanup task.
- Run a single unit file with `npx jest tests/unit/splitPayment.test.ts`. Run all unit tests with `npm run unit`.

## File Structure

- `helpers/silent-payments/splitPayment.ts` — **modify**. Pure planner: constants, `economicFloor`, `maxFeasibleCount`, `pickCount`, `logUniformPartition`, `deRound`, `planChangeOutputs`, `planSplitOutputs`, `estimateSplitRange`. Old `computeSplitCount`/`splitAmount` removed in cleanup.
- `tests/unit/splitPayment.test.ts` — **modify**. Tests for all new functions; old tests removed in cleanup.
- `helpers/silent-payments/index.ts` — **modify**. Export the new public surface.
- `class/wallets/types.ts` — **modify**. Add `changeAddresses?: string[]` to `CreateTransactionResult`.
- `class/wallets/hd-bip352-wallet.ts` — **modify**. Add `getChangeAddresses`, `shuffleOutputs`, `planSplitTransaction`; reorder `createSPTransaction` (coinselect-first, plan, shuffle, fee recompute); pass `splitPayment` down; remove pre-coinselect expansion.
- `tests/unit/hd-bip352-split.test.ts` — **create**. Tests for `getChangeAddresses`, `shuffleOutputs`, `planSplitTransaction`.
- `screen/send/SendDetails.tsx` — **modify**. Preview range; filter all change addresses; `splitOutputCount` from payment outputs.
- `screen/send/Confirm.tsx` — **modify (verify)**. Already shows the count from `splitOutputCount`; confirm it reflects the actual payment-output count.
- `loc/en.json` — **modify**. Add `split_payment_range`; the per-output equal-share rows are removed.

---

## Phase 1 — Pure planner (`helpers/silent-payments/splitPayment.ts`)

### Task 1: Constants, RNG type, and `economicFloor`

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `randomBytes` from `../../class/rng`.
- Produces:
  - `type RandomSource = (size: number) => Promise<Buffer>`
  - constants `SPLIT_MAX_OUTPUTS`, `SPLIT_MIN_OUTPUT_SATS`, `SPLIT_SPREAD_RATIO`, `FLOOR_K`, `SPEND_INPUT_VBYTES`, `OUTPUT_VBYTES`, `SPLIT_ROUND_MODULUS`, `DEFAULT_DUST_THRESHOLD`
  - `economicFloor(feeRate: number, rng?: RandomSource): Promise<number>`
  - helper `floatFromBytes(buf: Buffer, offset: number): number` (module-private, not exported)

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (keep existing tests; add the new import at top):

```typescript
import {
  economicFloor,
  SPLIT_MIN_OUTPUT_SATS as MIN,
  FLOOR_K,
  SPEND_INPUT_VBYTES,
} from '../../helpers/silent-payments/splitPayment';

// deterministic rng: every byte = value (default 0) so jitter is reproducible
const fixedRng = (value = 0) => async (size: number) => Buffer.alloc(size, value);

describe('economicFloor', () => {
  it('is at least the absolute minimum at low fee rates', async () => {
    const floor = await economicFloor(1, fixedRng(0));
    expect(floor).toBeGreaterThanOrEqual(MIN);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t economicFloor`
Expected: FAIL — `economicFloor` is not exported.

- [ ] **Step 3: Write minimal implementation**

At the **top** of `helpers/silent-payments/splitPayment.ts`, below the existing `import { randomBytes }` line, add the new constants, type, and `economicFloor` (leave the existing `computeSplitCount`/`splitAmount` in place for now):

```typescript
export const SPLIT_MAX_OUTPUTS = 5;
export const SPLIT_SPREAD_RATIO = 8;
export const FLOOR_K = 3;
export const SPEND_INPUT_VBYTES = 58;
export const OUTPUT_VBYTES = 43;
export const SPLIT_ROUND_MODULUS = 1000;
export const DEFAULT_DUST_THRESHOLD = 330;

export type RandomSource = (size: number) => Promise<Buffer>;

// Read a uniform float in [0, 1) from 4 big-endian bytes.
function floatFromBytes(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset) / 0x100000000;
}

// Economically spendable floor: a multiple of the cost to later spend a P2TR
// input, never below the absolute minimum, plus up to 10% random jitter so the
// floor is not a constant fingerprint.
export async function economicFloor(feeRate: number, rng: RandomSource = randomBytes): Promise<number> {
  const inputCost = Math.ceil(SPEND_INPUT_VBYTES * feeRate);
  const base = Math.max(SPLIT_MIN_OUTPUT_SATS, FLOOR_K * inputCost);
  const buf = await rng(4);
  const jitter = Math.floor(floatFromBytes(buf, 0) * 0.1 * base);
  return base + jitter;
}
```

`SPLIT_MIN_OUTPUT_SATS = 25_000` already exists at the top of the file — do not redeclare it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t economicFloor`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): add economicFloor and redesign constants"
```

---

### Task 2: `maxFeasibleCount` and `pickCount`

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `SPLIT_MAX_OUTPUTS`.
- Produces:
  - `maxFeasibleCount(paymentValue: number, floor: number): number`
  - `pickCount(paymentValue: number, floor: number, rng?: RandomSource): Promise<number>`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (extend the import from Task 1 to also import `maxFeasibleCount, pickCount, SPLIT_MAX_OUTPUTS`):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t "maxFeasibleCount|pickCount"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts` after `economicFloor`:

```typescript
// Largest number of outputs that can each meet the floor, capped.
export function maxFeasibleCount(paymentValue: number, floor: number): number {
  return Math.min(SPLIT_MAX_OUTPUTS, Math.floor(paymentValue / floor));
}

// Uniformly random count in [2, maxFeasible]; decoupled from the amount's
// magnitude. Caller guarantees maxFeasibleCount(...) >= 2.
export async function pickCount(paymentValue: number, floor: number, rng: RandomSource = randomBytes): Promise<number> {
  const maxFeasible = maxFeasibleCount(paymentValue, floor);
  if (maxFeasible <= 2) return 2;
  const buf = await rng(4);
  const span = maxFeasible - 2 + 1; // inclusive range size
  return 2 + (buf.readUInt32BE(0) % span);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t "maxFeasibleCount|pickCount"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): randomized output count decoupled from amount"
```

---

### Task 3: `logUniformPartition`

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `SPLIT_SPREAD_RATIO`.
- Produces: `logUniformPartition(total: number, n: number, floor: number, rng?: RandomSource): Promise<number[]>`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (import `logUniformPartition`):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t logUniformPartition`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts`:

```typescript
// Partition `total` into `n` integer parts, each >= floor, where the parts are
// weighted log-uniformly (weight = exp(u * ln R), u uniform in [0,1)). This
// spreads amounts across magnitudes instead of clustering around total/n.
export async function logUniformPartition(
  total: number,
  n: number,
  floor: number,
  rng: RandomSource = randomBytes,
): Promise<number[]> {
  if (n <= 0) throw new Error('n must be at least 1');
  if (n === 1) return [total];
  const budget = total - n * floor;
  if (budget < 0) throw new Error('total too small to split into n parts above the floor');

  const buf = await rng(n * 4 + 1);
  const lnR = Math.log(SPLIT_SPREAD_RATIO);
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    weights.push(Math.exp(floatFromBytes(buf, i * 4) * lnR));
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map(w => floor + Math.floor((w / sumW) * budget));

  // Assign integer rounding slack to a random part so the sum is exact.
  const slack = total - parts.reduce((a, b) => a + b, 0);
  parts[buf[n * 4] % n] += slack;
  return parts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t logUniformPartition`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): log-uniform amount partition"
```

---

### Task 4: `deRound`

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `RandomSource`, `SPLIT_ROUND_MODULUS`.
- Produces: `deRound(amounts: number[], floor: number, rng?: RandomSource): Promise<number[]>`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (import `deRound, SPLIT_ROUND_MODULUS`):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t deRound`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts`:

```typescript
// Nudge any round amount (divisible by SPLIT_ROUND_MODULUS) by a small delta,
// compensating on another element so the array sum is preserved. Only works on
// arrays of length >= 2; single elements are returned unchanged.
export async function deRound(amounts: number[], floor: number, rng: RandomSource = randomBytes): Promise<number[]> {
  const out = amounts.slice();
  if (out.length < 2) return out;

  for (let i = 0; i < out.length; i++) {
    if (out[i] % SPLIT_ROUND_MODULUS !== 0) continue;
    const buf = await rng(2);
    const delta = 1 + (buf.readUInt8(0) % (SPLIT_ROUND_MODULUS - 1));
    // find a partner != i that stays >= floor after losing delta
    const start = buf.readUInt8(1) % out.length;
    let partner = -1;
    for (let k = 0; k < out.length; k++) {
      const j = (start + k) % out.length;
      if (j !== i && out[j] - delta >= floor) {
        partner = j;
        break;
      }
    }
    if (partner === -1) continue; // no room to compensate; leave as-is
    out[i] += delta;
    out[partner] -= delta;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t deRound`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): round-number guard (deRound)"
```

---

### Task 5: `planChangeOutputs`

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `logUniformPartition`, `OUTPUT_VBYTES`, `DEFAULT_DUST_THRESHOLD`, `RandomSource`.
- Produces:
  ```typescript
  planChangeOutputs(params: {
    change: number;
    pMax: number;
    floor: number;
    feeRate: number;
    paymentCount: number;
    outputVBytes?: number;
    dustThreshold?: number;
    rng?: RandomSource;
  }): Promise<number[]>
  ```

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (import `planChangeOutputs`):

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t planChangeOutputs`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts`:

```typescript
// Plan the change outputs so they blend with the payment outputs. A single
// change output is used when it is <= pMax (already in-distribution); otherwise
// change is split into in-range pieces. The fee for every output beyond the
// 2-output coin-selection baseline is subtracted from change first.
export async function planChangeOutputs(params: {
  change: number;
  pMax: number;
  floor: number;
  feeRate: number;
  paymentCount: number;
  outputVBytes?: number;
  dustThreshold?: number;
  rng?: RandomSource;
}): Promise<number[]> {
  const { change, pMax, floor, feeRate, paymentCount } = params;
  const outputVBytes = params.outputVBytes ?? OUTPUT_VBYTES;
  const dustThreshold = params.dustThreshold ?? DEFAULT_DUST_THRESHOLD;
  const rng = params.rng ?? randomBytes;
  if (change <= 0) return [];

  const PRICED_OUTPUTS = 2; // coinselect baseline: 1 payment + 1 change
  const feePerOutput = Math.ceil(outputVBytes * feeRate);

  // Start from the piece count needed for each piece to be <= pMax, then reduce
  // if added-output fees would push a piece below dust/floor. Reducing pieces
  // lowers the fee, so this converges.
  for (let m = Math.max(1, Math.ceil(change / pMax)); m >= 1; m--) {
    const extraFee = Math.max(0, paymentCount + m - PRICED_OUTPUTS) * feePerOutput;
    const distributable = change - extraFee;
    if (distributable < dustThreshold) continue;
    if (m === 1) return [distributable];
    if (distributable < m * floor) continue;
    return logUniformPartition(distributable, m, floor, rng);
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t planChangeOutputs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): adaptive change-output planning"
```

---

### Task 6: `planSplitOutputs` (top-level planner)

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `economicFloor`, `maxFeasibleCount`, `pickCount`, `logUniformPartition`, `deRound`, `planChangeOutputs`.
- Produces:
  ```typescript
  planSplitOutputs(params: {
    paymentValue: number;
    changeValue: number;
    feeRate: number;
    outputVBytes?: number;
    dustThreshold?: number;
    rng?: RandomSource;
  }): Promise<{ paymentAmounts: number[]; changeAmounts: number[] }>
  ```

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (import `planSplitOutputs`):

```typescript
describe('planSplitOutputs', () => {
  it('payments always sum to exactly the payment value', async () => {
    for (let trial = 0; trial < 30; trial++) {
      const { paymentAmounts } = await planSplitOutputs({
        paymentValue: 500_000, changeValue: 120_000, feeRate: 5,
      });
      expect(paymentAmounts.reduce((a, b) => a + b, 0)).toBe(500_000);
    }
  });

  it('does not split when the amount is too small for the fee-relative floor', async () => {
    // very high fee -> floor large -> maxFeasible < 2 -> single payment output
    const { paymentAmounts } = await planSplitOutputs({
      paymentValue: 60_000, changeValue: 0, feeRate: 500,
    });
    expect(paymentAmounts).toEqual([60_000]);
  });

  it('produces blended change within the payment range when change is large', async () => {
    const { paymentAmounts, changeAmounts } = await planSplitOutputs({
      paymentValue: 300_000, changeValue: 5_000_000, feeRate: 2,
    });
    expect(changeAmounts.length).toBeGreaterThan(1);
    const pMax = Math.max(...paymentAmounts);
    for (const c of changeAmounts) expect(c).toBeLessThanOrEqual(pMax * 1.5);
  });

  it('avoids round payment amounts', async () => {
    let allClean = true;
    for (let trial = 0; trial < 30; trial++) {
      const { paymentAmounts } = await planSplitOutputs({
        paymentValue: 400_000, changeValue: 90_000, feeRate: 3,
      });
      if (paymentAmounts.some(a => a % 1000 === 0)) allClean = false;
    }
    expect(allClean).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t planSplitOutputs`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts`:

```typescript
// Top-level planner: turns a single payment value + the coin-selected change
// into a blended set of payment and change amounts.
export async function planSplitOutputs(params: {
  paymentValue: number;
  changeValue: number;
  feeRate: number;
  outputVBytes?: number;
  dustThreshold?: number;
  rng?: RandomSource;
}): Promise<{ paymentAmounts: number[]; changeAmounts: number[] }> {
  const { paymentValue, changeValue, feeRate } = params;
  const rng = params.rng ?? randomBytes;
  const outputVBytes = params.outputVBytes ?? OUTPUT_VBYTES;
  const dustThreshold = params.dustThreshold ?? DEFAULT_DUST_THRESHOLD;

  const floor = await economicFloor(feeRate, rng);

  let paymentAmounts: number[];
  if (maxFeasibleCount(paymentValue, floor) < 2) {
    paymentAmounts = [paymentValue]; // too small to split at this fee rate
  } else {
    const n = await pickCount(paymentValue, floor, rng);
    paymentAmounts = await deRound(await logUniformPartition(paymentValue, n, floor, rng), floor, rng);
  }

  const pMax = Math.max(...paymentAmounts);
  let changeAmounts = await planChangeOutputs({
    change: changeValue,
    pMax,
    floor,
    feeRate,
    paymentCount: paymentAmounts.length,
    outputVBytes,
    dustThreshold,
    rng,
  });
  if (changeAmounts.length > 1) {
    changeAmounts = await deRound(changeAmounts, floor, rng);
  }
  return { paymentAmounts, changeAmounts };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t planSplitOutputs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): unified planSplitOutputs planner"
```

---

### Task 7: `estimateSplitRange` + export new surface

**Files:**
- Modify: `helpers/silent-payments/splitPayment.ts`
- Modify: `helpers/silent-payments/index.ts`
- Test: `tests/unit/splitPayment.test.ts`

**Interfaces:**
- Consumes: `SPLIT_MAX_OUTPUTS`, `SPLIT_MIN_OUTPUT_SATS`, `FLOOR_K`, `SPEND_INPUT_VBYTES`.
- Produces: `estimateSplitRange(paymentValue: number, feeRate: number): { min: number; max: number }`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/splitPayment.test.ts` (import `estimateSplitRange`):

```typescript
describe('estimateSplitRange', () => {
  it('returns {min:2, max:maxFeasible} for splittable amounts', () => {
    expect(estimateSplitRange(450_000, 1)).toEqual({ min: 2, max: 5 });
  });
  it('returns {min:1, max:1} when not splittable at this fee rate', () => {
    expect(estimateSplitRange(30_000, 1)).toEqual({ min: 1, max: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/splitPayment.test.ts -t estimateSplitRange`
Expected: FAIL — not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `helpers/silent-payments/splitPayment.ts`:

```typescript
// UI preview helper: the count is randomized and fee-dependent, so the preview
// shows a range. Uses the base floor without jitter (a deliberate estimate).
export function estimateSplitRange(paymentValue: number, feeRate: number): { min: number; max: number } {
  const inputCost = Math.ceil(SPEND_INPUT_VBYTES * Math.max(1, feeRate));
  const floorEstimate = Math.max(SPLIT_MIN_OUTPUT_SATS, FLOOR_K * inputCost);
  const maxFeasible = Math.min(SPLIT_MAX_OUTPUTS, Math.floor(paymentValue / floorEstimate));
  if (maxFeasible < 2) return { min: 1, max: 1 };
  return { min: 2, max: maxFeasible };
}
```

Then update `helpers/silent-payments/index.ts` — replace the line:

```typescript
export { computeSplitCount, splitAmount, SPLIT_MIN_OUTPUT_SATS } from './splitPayment';
```

with (keep `computeSplitCount`/`splitAmount` for now; they are removed in Task 12):

```typescript
export {
  computeSplitCount,
  splitAmount,
  planSplitOutputs,
  estimateSplitRange,
  SPLIT_MIN_OUTPUT_SATS,
} from './splitPayment';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/splitPayment.test.ts -t estimateSplitRange && npm run tslint`
Expected: PASS; tsc reports no errors.

- [ ] **Step 5: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts helpers/silent-payments/index.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): estimateSplitRange and export new planner surface"
```

---

## Phase 2 — Wallet integration (`class/wallets/hd-bip352-wallet.ts`)

### Task 8: Extend `CreateTransactionResult` with `changeAddresses`

**Files:**
- Modify: `class/wallets/types.ts:38-44`

**Interfaces:**
- Produces: `CreateTransactionResult.changeAddresses?: string[]`

- [ ] **Step 1: Make the change**

In `class/wallets/types.ts`, change the `CreateTransactionResult` type:

```typescript
export type CreateTransactionResult = {
  tx?: bitcoin.Transaction;
  inputs: CoinSelectReturnInput[];
  outputs: CoinSelectOutput[];
  fee: number;
  psbt: bitcoin.Psbt;
  changeAddresses?: string[];
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run tslint`
Expected: no errors (optional field, no existing code breaks).

- [ ] **Step 3: Commit**

```bash
git add class/wallets/types.ts
git commit -m "feat(split): add changeAddresses to CreateTransactionResult"
```

---

### Task 9: `getChangeAddresses` and `shuffleOutputs` helpers

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts`
- Test: `tests/unit/hd-bip352-split.test.ts` (create)

**Interfaces:**
- Consumes: `this._getInternalAddressByIndex`, `this.next_free_change_address_index`, `randomBytes`.
- Produces (private methods on `HDSilentPaymentsWallet`):
  - `getChangeAddresses(count: number): string[]`
  - `shuffleOutputs<T>(arr: T[]): Promise<T[]>`

Note: the tests below call these private methods via bracket access (`(wallet as any).getChangeAddresses(...)`), which is acceptable in tests.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hd-bip352-split.test.ts`:

```typescript
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function makeWallet(): HDSilentPaymentsWallet {
  const w = new HDSilentPaymentsWallet();
  w.setSecret(MNEMONIC);
  return w;
}

describe('getChangeAddresses', () => {
  it('returns one address for count = 1 without advancing the pointer', () => {
    const w = makeWallet();
    const before = w.next_free_change_address_index;
    const addrs = (w as any).getChangeAddresses(1);
    expect(addrs).toHaveLength(1);
    expect(w.next_free_change_address_index).toBe(before);
  });

  it('returns N distinct sequential addresses and advances the pointer', () => {
    const w = makeWallet();
    const base = w.next_free_change_address_index;
    const addrs: string[] = (w as any).getChangeAddresses(3);
    expect(addrs).toHaveLength(3);
    expect(new Set(addrs).size).toBe(3);
    expect(addrs[0]).toBe(w._getInternalAddressByIndex(base));
    expect(addrs[2]).toBe(w._getInternalAddressByIndex(base + 2));
    expect(w.next_free_change_address_index).toBe(base + 3);
  });
});

describe('shuffleOutputs', () => {
  it('preserves the multiset of elements', async () => {
    const w = makeWallet();
    const input = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }];
    const out = await (w as any).shuffleOutputs(input);
    expect(out).toHaveLength(5);
    expect(out.map((o: any) => o.v).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('reorders across trials (not always identity)', async () => {
    const w = makeWallet();
    let reordered = false;
    for (let trial = 0; trial < 20 && !reordered; trial++) {
      const out = await (w as any).shuffleOutputs([1, 2, 3, 4, 5]);
      if (out.join(',') !== '1,2,3,4,5') reordered = true;
    }
    expect(reordered).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/hd-bip352-split.test.ts`
Expected: FAIL — `getChangeAddresses`/`shuffleOutputs` not defined.

- [ ] **Step 3: Write minimal implementation**

Add these two private methods to the `HDSilentPaymentsWallet` class in `class/wallets/hd-bip352-wallet.ts` (place them just above `createTransaction`). Ensure `randomBytes` is imported — add `import { randomBytes } from '../rng';` near the other imports if not already present.

```typescript
  // Derive `count` distinct sequential internal (change) addresses. The first
  // equals the wallet's current free change address; deriving more than one
  // advances the free-change pointer so the extra pieces are never reused.
  private getChangeAddresses(count: number): string[] {
    const base = this.next_free_change_address_index;
    const addresses = Array.from({ length: count }, (_, i) => this._getInternalAddressByIndex(base + i));
    if (count > 1) this.next_free_change_address_index = base + count;
    return addresses;
  }

  // Cryptographic Fisher–Yates shuffle so the change output is not positionally
  // identifiable among the transaction outputs.
  private async shuffleOutputs<T>(arr: T[]): Promise<T[]> {
    const out = arr.slice();
    if (out.length < 2) return out;
    const buf = await randomBytes(out.length * 4);
    for (let i = out.length - 1; i > 0; i--) {
      const j = buf.readUInt32BE(i * 4) % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/hd-bip352-split.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts tests/unit/hd-bip352-split.test.ts
git commit -m "feat(split): wallet helpers for distinct change addresses and output shuffle"
```

---

### Task 10: `planSplitTransaction` (compose planner + addresses + shuffle)

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts`
- Test: `tests/unit/hd-bip352-split.test.ts`

**Interfaces:**
- Consumes: `planSplitOutputs` (from `../../helpers/silent-payments/splitPayment`), `getChangeAddresses`, `shuffleOutputs`, `CoinSelectOutput` (already imported via types/coinselect).
- Produces (private method):
  ```typescript
  planSplitTransaction(
    spAddress: string,
    paymentValue: number,
    changeValue: number,
    feeRate: number,
  ): Promise<{ outputs: CoinSelectOutput[]; changeAddresses: string[] }>
  ```
  `outputs` is the shuffled union of payment outputs (`address = spAddress`) and change outputs (`address` = a distinct internal change address).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/hd-bip352-split.test.ts`:

```typescript
import { SilentPayment } from 'silent-payments'; // for a valid sp1 string in tests, if available
```

If importing a real `sp1` address is awkward, use a literal placeholder address — `planSplitTransaction` only copies it onto payment outputs and does not validate it. Add:

```typescript
describe('planSplitTransaction', () => {
  const SP = 'sp1qexamplerecipientaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  it('payment outputs all carry the sp address and sum to the payment value', async () => {
    const w = makeWallet();
    const { outputs } = await (w as any).planSplitTransaction(SP, 500_000, 120_000, 2);
    const payments = outputs.filter((o: any) => o.address === SP);
    expect(payments.length).toBeGreaterThanOrEqual(2);
    expect(payments.reduce((a: number, o: any) => a + o.value, 0)).toBe(500_000);
  });

  it('change outputs use distinct internal addresses (no reuse)', async () => {
    const w = makeWallet();
    const { outputs, changeAddresses } = await (w as any).planSplitTransaction(SP, 300_000, 5_000_000, 2);
    const changeOuts = outputs.filter((o: any) => o.address !== SP);
    expect(changeOuts.length).toBe(changeAddresses.length);
    expect(new Set(changeAddresses).size).toBe(changeAddresses.length);
  });

  it('returns a single payment output when not splittable', async () => {
    const w = makeWallet();
    const { outputs } = await (w as any).planSplitTransaction(SP, 60_000, 0, 500);
    const payments = outputs.filter((o: any) => o.address === SP);
    expect(payments).toEqual([{ address: SP, value: 60_000 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/hd-bip352-split.test.ts -t planSplitTransaction`
Expected: FAIL — `planSplitTransaction` not defined.

- [ ] **Step 3: Write minimal implementation**

Ensure the import at the top of `class/wallets/hd-bip352-wallet.ts` includes `planSplitOutputs` (it currently imports `computeSplitCount, splitAmount`):

```typescript
import { computeSplitCount, splitAmount, planSplitOutputs } from '../../helpers/silent-payments/splitPayment';
```

Add the method to `HDSilentPaymentsWallet` (above `createTransaction`, beside the Task 9 helpers):

```typescript
  // Build the blended output set for a split silent payment: payment outputs to
  // the recipient's sp address plus adaptive, distinct-addressed change outputs,
  // all shuffled.
  private async planSplitTransaction(
    spAddress: string,
    paymentValue: number,
    changeValue: number,
    feeRate: number,
  ): Promise<{ outputs: CoinSelectOutput[]; changeAddresses: string[] }> {
    const { paymentAmounts, changeAmounts } = await planSplitOutputs({ paymentValue, changeValue, feeRate });
    const paymentOutputs: CoinSelectOutput[] = paymentAmounts.map(value => ({ address: spAddress, value }));
    const changeAddresses = this.getChangeAddresses(changeAmounts.length);
    const changeOutputs: CoinSelectOutput[] = changeAmounts.map((value, i) => ({ address: changeAddresses[i], value }));
    const outputs = await this.shuffleOutputs([...paymentOutputs, ...changeOutputs]);
    return { outputs, changeAddresses };
  }
```

`CoinSelectOutput` is already imported in this file (used by the existing code). If not, add it to the `coinselect` import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/hd-bip352-split.test.ts -t planSplitTransaction && npm run tslint`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts tests/unit/hd-bip352-split.test.ts
git commit -m "feat(split): planSplitTransaction composes planner, change addresses, shuffle"
```

---

### Task 11: Reorder `createSPTransaction` and wire splitting (coinselect-first)

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts` (`createTransaction` ~760-806 and `createSPTransaction` ~808-938)

**Interfaces:**
- Consumes: `planSplitTransaction`, the existing coinselect/SP-resolution/PSBT code.
- Produces: `createSPTransaction(..., splitPayment = false)` returning `CreateTransactionResult` with recomputed `fee` and `changeAddresses`.

- [ ] **Step 1: Update `createTransaction` to remove pre-coinselect expansion and pass `splitPayment` down**

In `class/wallets/hd-bip352-wallet.ts`, replace the split-expansion block in `createTransaction` (currently lines ~773-781):

```typescript
    // Split expansion runs before UTXO categorization so it applies regardless of which case handles the tx.
    let expandedTargets = targets;
    if (splitPayment && targets.length === 1 && targets[0].address?.startsWith('sp1') && targets[0].value) {
      const n = computeSplitCount(targets[0].value);
      if (n > 1) {
        const amounts = await splitAmount(targets[0].value, n);
        expandedTargets = amounts.map(amt => ({ address: targets[0].address!, value: amt }));
      }
    }
```

with nothing (delete it). Then update the two dispatch calls so the SP case forwards `splitPayment` and both cases use the original `targets`:

```typescript
    // Case 1: Only SP UTXOs - use SP builder exclusively
    if (spUtxos.length > 0 && regularUtxos.length === 0) {
      return this.createSPTransaction(spUtxos, targets, feeRate, changeAddress, sequence, skipSigning, splitPayment);
    }

    // Case 2: Only regular UTXOs - delegate to parent
    if (spUtxos.length === 0 && regularUtxos.length > 0) {
      return super.createTransaction(regularUtxos, targets, feeRate, changeAddress, sequence, skipSigning, masterFingerprint);
    }
```

- [ ] **Step 2: Update the `createSPTransaction` signature and body**

Change the signature to accept `splitPayment`:

```typescript
  private async createSPTransaction(
    spUtxos: SilentPaymentUTXO[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number,
    skipSigning: boolean,
    splitPayment = false,
  ): Promise<CreateTransactionResult> {
```

Immediately after the existing `const { inputs, outputs: rawOutputs, fee } = this.coinselect(...)` and `const utxoMap = ...` lines, **replace** the current:

```typescript
    let outputs = rawOutputs;
    const hasSPOutput = rawOutputs.some(o => o.address?.startsWith('sp1'));
```

with the split-planning block (coinselect already ran on the single target above, so its change is available):

```typescript
    let plannedOutputs = rawOutputs;
    let changeAddresses: string[] = [changeAddress];
    const canSplit =
      splitPayment && targets.length === 1 && !!targets[0].address?.startsWith('sp1') && !!targets[0].value;
    if (canSplit) {
      const changeValue = rawOutputs.find(o => !o.address)?.value ?? 0;
      const planned = await this.planSplitTransaction(targets[0].address!, targets[0].value!, changeValue, feeRate);
      plannedOutputs = planned.outputs;
      changeAddresses = planned.changeAddresses;
    }

    let outputs = plannedOutputs;
    const hasSPOutput = plannedOutputs.some(o => o.address?.startsWith('sp1'));
```

- [ ] **Step 3: Point SP resolution at `plannedOutputs`**

In the `if (hasSPOutput) { ... }` block, change the resolution call to use `plannedOutputs` instead of `rawOutputs`:

```typescript
        const sp = new SilentPayment();
        const resolved = sp.createTransaction(libUtxos, plannedOutputs);
        outputs = resolved.map((t, i) => ({ ...plannedOutputs[i], address: t.address ?? plannedOutputs[i].address }));
```

- [ ] **Step 4: Recompute fee from inputs−outputs and return `changeAddresses`**

Replace the final `return { ... }` block of `createSPTransaction` with one that recomputes the fee and returns the change addresses (the local `fee` from coinselect is shadowed by the recomputed value):

```typescript
      const totalIn = inputs.reduce((sum, i) => sum + i.value, 0);
      const totalOut = outputs.reduce((sum, o) => sum + o.value, 0);
      const recomputedFee = totalIn - totalOut;

      return {
        tx,
        psbt,
        inputs: inputs.map(i => ({
          txid: i.txid,
          vout: i.vout,
          address: i.address,
          value: i.value,
        })),
        outputs: outputs.map(o => ({
          address: o.address || changeAddress,
          value: o.value,
        })),
        fee: recomputedFee,
        changeAddresses,
      };
```

Because `fee` from `coinselect` is no longer returned, ESLint may flag it as unused. Rename the destructure to `fee: _baseFee` and reference it nowhere, or remove `fee` from the destructure entirely: `const { inputs, outputs: rawOutputs } = this.coinselect(...)`.

- [ ] **Step 5: Verify type-check and existing unit tests**

Run: `npm run tslint && npm run unit`
Expected: tsc clean; all unit tests pass (Phase 1 + Task 9/10 tests).

- [ ] **Step 6: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts
git commit -m "feat(split): coinselect-first reorder, blended outputs, fee recompute"
```

---

## Phase 3 — UI integration

### Task 12: SendDetails preview range + change-address filtering; remove old planner usage

**Files:**
- Modify: `screen/send/SendDetails.tsx` (imports line 31; `splitCount` line 105; preview block 930-950; createPsbt block 571-613)
- Modify: `loc/en.json` (add `split_payment_range`)
- Modify: `helpers/silent-payments/splitPayment.ts` (remove `computeSplitCount`, `splitAmount`, `SPLIT_OUTPUT_THRESHOLD_SATS`)
- Modify: `helpers/silent-payments/index.ts` (drop `computeSplitCount`, `splitAmount` exports)
- Modify: `class/wallets/hd-bip352-wallet.ts` (drop now-unused `computeSplitCount`, `splitAmount` import)
- Modify: `tests/unit/splitPayment.test.ts` (remove the old `computeSplitCount`/`splitAmount` describe blocks)

This task removes the legacy planner now that nothing uses it, and migrates the UI to the range preview. Do the removals and the UI change together so every file stays consistent and `tsc`/lint pass.

- [ ] **Step 1: Migrate `SendDetails.tsx` imports and the preview value**

Change line 31 from:

```typescript
import { computeSplitCount, SPLIT_MIN_OUTPUT_SATS } from '../../helpers/silent-payments/splitPayment';
```

to:

```typescript
import { estimateSplitRange, SPLIT_MIN_OUTPUT_SATS } from '../../helpers/silent-payments/splitPayment';
```

Change line 105 from:

```typescript
  const splitCount = isSplitEligible ? computeSplitCount(Number(recipient?.amountSats)) : 0;
```

to:

```typescript
  const splitRange = isSplitEligible
    ? estimateSplitRange(Number(recipient?.amountSats), Number(feeRate) || 1)
    : { min: 0, max: 0 };
```

- [ ] **Step 2: Replace the per-output equal-share preview with a range display**

Replace the block at lines 930-950 (the `{isSplitEnabled && splitCount > 1 && ( ... )}` JSX) with:

```typescript
            {isSplitEnabled && splitRange.max > 1 && (
              <View style={[styles.splitPreviewSection, stylesHook.splitPreviewSection]}>
                <View style={styles.splitPreviewRow}>
                  <Text style={[styles.splitPreviewLabel, stylesHook.splitPreviewLabel]}>{loc.send.split_payment}</Text>
                  <Text style={[styles.splitPreviewAmount, stylesHook.splitPreviewAmount]}>
                    {loc.formatString(loc.send.split_payment_range, { min: splitRange.min, max: splitRange.max })}
                  </Text>
                </View>
                <View style={[styles.splitFeeIncreaseRow, stylesHook.splitFeeIncreaseRow]}>
                  <Text style={[styles.splitFeeIncreaseLabel, stylesHook.splitFeeIncreaseLabel]}>{loc.send.fee_increase}</Text>
                  <Text style={[styles.splitFeeIncreaseValue, stylesHook.splitFeeIncreaseValue]}>
                    {`≈ +${satoshiToBTC(Math.round(Number(feeRate) * 43 * (splitRange.max - 1)))} ${loc.units[BitcoinUnit.BTC]}`}
                  </Text>
                </View>
              </View>
            )}
```

This drops the misleading equal-share per-output rows (amounts are now unequal and the count is randomized) and shows the estimated range plus a worst-case fee estimate. Verify whether `React` is still used elsewhere in the file (the removed block used `React.Fragment`); if `React` becomes unused, remove its import to satisfy lint.

- [ ] **Step 3: Filter all change addresses when building recipients for Confirm**

In `createPsbtTransaction`, change the destructure (line ~571) to capture `changeAddresses`:

```typescript
    const { tx, outputs, psbt, fee, changeAddresses } = await (wallet as HDSilentPaymentsWallet)?.createTransaction(
```

Then replace the recipients filter (lines ~597):

```typescript
    let recipients = outputs.filter(({ address }) => address !== change);
```

with a filter that excludes every change address used:

```typescript
    const changeSet = new Set(changeAddresses ?? [change]);
    let recipients = outputs.filter(({ address }) => !address || !changeSet.has(address));
```

The `splitOutputCount: isSplitEnabled ? recipients.length : undefined` line (612) now correctly counts payment outputs only, since all change pieces are filtered out.

- [ ] **Step 4: Add the loc string**

In `loc/en.json`, in the `send` section near the other split strings (after line 154), add:

```json
        "split_payment_range": "≈ {{min}}–{{max}} outputs",
```

Ensure the preceding line keeps its trailing comma and JSON stays valid.

- [ ] **Step 5: Remove the legacy planner and its exports/tests**

In `helpers/silent-payments/splitPayment.ts`, delete `export const SPLIT_OUTPUT_THRESHOLD_SATS = 100_000;`, the entire `computeSplitCount` function, and the entire `splitAmount` function.

In `helpers/silent-payments/index.ts`, change the export to drop the removed names:

```typescript
export {
  planSplitOutputs,
  estimateSplitRange,
  SPLIT_MIN_OUTPUT_SATS,
} from './splitPayment';
```

In `class/wallets/hd-bip352-wallet.ts`, change the planner import to drop the removed names:

```typescript
import { planSplitOutputs } from '../../helpers/silent-payments/splitPayment';
```

In `tests/unit/splitPayment.test.ts`, delete the original `describe('computeSplitCount', ...)` and `describe('splitAmount', ...)` blocks and remove `computeSplitCount`, `splitAmount` from the imports.

- [ ] **Step 6: Verify type-check, lint, and unit tests**

Run: `npm run tslint && npm run unit && npm run lint`
Expected: tsc clean; all unit tests pass; eslint passes including `find-unused-loc.js` (the new `split_payment_range` is used; no orphaned loc strings remain). If `find-unused-loc.js` flags any split loc string you stopped using, remove it from `loc/en.json`.

- [ ] **Step 7: Commit**

```bash
git add screen/send/SendDetails.tsx loc/en.json helpers/silent-payments/splitPayment.ts helpers/silent-payments/index.ts class/wallets/hd-bip352-wallet.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): range preview, change-address filtering, drop legacy planner"
```

---

### Task 13: Verify Confirm output-count display

**Files:**
- Verify: `screen/send/Confirm.tsx:96-97,229-235`

`Confirm` already reads `splitOutputCount` from route params and renders `loc.send.split_into_outputs` with it. After Task 12, `splitOutputCount` is the number of payment outputs (change excluded), which is exactly what should be shown. No code change is expected — this task confirms the behavior.

- [ ] **Step 1: Confirm the count source**

Read `screen/send/Confirm.tsx` lines 96-97 and 229-235. Verify `splitOutputCount` is used for the title and `recipients` (already change-filtered in Task 12) drives the per-output list.

- [ ] **Step 2: Confirm no stale assumption of equal amounts**

Verify the Confirm per-output list (around lines 235-285) renders each recipient's actual `value` (not a computed equal share). If it derives amounts by dividing the total by the count, change it to render `r.value` per recipient. If it already renders `r.value`, no change is needed.

- [ ] **Step 3: Full verification run**

Run: `npm run tslint && npm run unit && npm run lint`
Expected: all pass.

- [ ] **Step 4: Commit (only if a change was needed)**

```bash
git add screen/send/Confirm.tsx
git commit -m "fix(split): render actual per-output amounts on Confirm"
```

If Step 2 required no change, skip this commit.

---

## Final verification

- [ ] Run the full unit + type + lint suite:

Run: `npm run tslint && npm run unit && npm run lint`
Expected: all green.

- [ ] Manual smoke (device/emulator, optional but recommended): enter an `sp1` recipient with an amount ≥ ~2× the fee-relative floor, enable the split toggle, confirm the preview shows a range, build the transaction, and verify on Confirm that the payment is split into several unequal, non-round outputs and the change is not trivially identifiable.

---

## Self-Review

**Spec coverage:**
- Count decoupled from V → Task 2 (`pickCount`). ✓
- Log-uniform distribution → Task 3. ✓
- Fee-relative floor + jitter → Task 1 (`economicFloor`). ✓
- Round-number guard → Task 4 (`deRound`). ✓
- Adaptive change blending → Task 5 (`planChangeOutputs`) + Task 6 (`planSplitOutputs`). ✓
- Coinselect-first reorder + shuffle + distinct change addresses + fee recompute → Tasks 9, 10, 11. ✓
- `changeAddresses` in result + UI filtering → Tasks 8, 12. ✓
- Estimated-range preview / exact on Confirm → Tasks 7, 12, 13. ✓
- Injectable RNG for tests → Tasks 1-6 (every randomness function takes `rng`). ✓
- Legacy planner removal → Task 12. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every test step contains real assertions. ✓

**Type consistency:** `planSplitOutputs` returns `{ paymentAmounts, changeAmounts }` (Task 6) consumed by `planSplitTransaction` (Task 10). `planChangeOutputs` returns `number[]` (Task 5) consumed in Task 6. `CreateTransactionResult.changeAddresses` (Task 8) produced in Task 11, consumed in Task 12. `estimateSplitRange` returns `{ min, max }` (Task 7) consumed in Task 12. Names consistent across tasks. ✓
