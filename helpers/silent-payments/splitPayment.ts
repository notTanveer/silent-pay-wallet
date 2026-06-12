import { randomBytes } from '../../class/rng';

export const SPLIT_OUTPUT_THRESHOLD_SATS = 100_000;
export const SPLIT_MAX_OUTPUTS = 5;
export const SPLIT_MIN_OUTPUT_SATS = 25_000;

export function computeSplitCount(totalSats: number): number {
  if (totalSats < 2 * SPLIT_MIN_OUTPUT_SATS) return 1;
  const raw = Math.round(totalSats / SPLIT_OUTPUT_THRESHOLD_SATS);
  const clamped = Math.max(2, Math.min(raw, SPLIT_MAX_OUTPUTS));
  const feasible = Math.floor(totalSats / SPLIT_MIN_OUTPUT_SATS);
  return Math.min(clamped, feasible);
}

// splitAmount is async because randomBytes is async in React Native.
export async function splitAmount(totalSats: number, n: number): Promise<number[]> {
  const remainder = totalSats - n * SPLIT_MIN_OUTPUT_SATS;
  if (remainder < 0) throw new Error('totalSats too small to split into n parts above minimum');

  // Generate n random weights from 4 random bytes each
  const buf = await randomBytes(n * 4);
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    weights.push(buf.readUInt32BE(i * 4) + 1); // +1 to avoid zero weight
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Distribute remainder proportionally, floor each part
  const parts = weights.map(w => SPLIT_MIN_OUTPUT_SATS + Math.floor((w / weightSum) * remainder));

  // Assign rounding slack to a random part so sum is exact
  const slack = totalSats - parts.reduce((a, b) => a + b, 0);
  const slackIndex = buf[0] % n;
  parts[slackIndex] += slack;

  return parts;
}
