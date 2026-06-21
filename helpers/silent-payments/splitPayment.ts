import { randomBytes } from '../../class/rng';

export const SPLIT_MAX_OUTPUTS = 5;
export const SPLIT_MIN_OUTPUT_SATS = 25_000;
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

// Partition `total` into `n` integer parts, each >= floor, where the parts are
// weighted log-uniformly (weight = exp(u * ln R), u uniform in [0,1)). This
// spreads amounts across magnitudes instead of clustering around total/n.
export async function logUniformPartition(total: number, n: number, floor: number, rng: RandomSource = randomBytes): Promise<number[]> {
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

// UI preview helper: the count is randomized and fee-dependent, so the preview
// shows a range. Uses the base floor without jitter (a deliberate estimate).
export function estimateSplitRange(paymentValue: number, feeRate: number): { min: number; max: number } {
  const inputCost = Math.ceil(SPEND_INPUT_VBYTES * Math.max(1, feeRate));
  const floorEstimate = Math.max(SPLIT_MIN_OUTPUT_SATS, FLOOR_K * inputCost);
  const maxFeasible = Math.min(SPLIT_MAX_OUTPUTS, Math.floor(paymentValue / floorEstimate));
  if (maxFeasible < 2) return { min: 1, max: 1 };
  return { min: 2, max: maxFeasible };
}
