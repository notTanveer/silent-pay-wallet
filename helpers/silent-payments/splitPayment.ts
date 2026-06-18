import { randomBytes } from '../../class/rng';

export const SPLIT_OUTPUT_THRESHOLD_SATS = 100_000;
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

export function computeSplitCount(totalSats: number): number {
  if (totalSats < 2 * SPLIT_MIN_OUTPUT_SATS) return 1;
  const raw = Math.round(totalSats / SPLIT_OUTPUT_THRESHOLD_SATS);
  const clamped = Math.max(2, Math.min(raw, SPLIT_MAX_OUTPUTS));
  const feasible = Math.floor(totalSats / SPLIT_MIN_OUTPUT_SATS);
  return Math.min(clamped, feasible);
}

// splitAmount is async because randomBytes is async in React Native.
export async function splitAmount(totalSats: number, n: number): Promise<number[]> {
  if (n <= 0) throw new Error('n must be at least 1');
  const remainder = totalSats - n * SPLIT_MIN_OUTPUT_SATS;
  if (remainder < 0) throw new Error('totalSats too small to split into n parts above minimum');

  // Generate n random weights from 4 random bytes each, plus 1 extra byte for slackIndex
  const buf = await randomBytes(n * 4 + 1);
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    weights.push(buf.readUInt32BE(i * 4) + 1); // +1 to avoid zero weight
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Distribute remainder proportionally, floor each part
  const parts = weights.map(w => SPLIT_MIN_OUTPUT_SATS + Math.floor((w / weightSum) * remainder));

  // Assign rounding slack to a random part so sum is exact
  // Use the extra byte (beyond weight data) to avoid correlation with weights[0]
  const slack = totalSats - parts.reduce((a, b) => a + b, 0);
  const slackIndex = buf[n * 4] % n;
  parts[slackIndex] += slack;

  return parts;
}

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
