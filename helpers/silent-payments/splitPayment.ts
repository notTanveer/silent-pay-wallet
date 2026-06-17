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
