# Split Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Split payment" toggle to the send screen that, when sending to a single `sp1…` recipient, automatically splits the payment into 2–5 Taproot outputs in one transaction using the BIP-352 `k` counter — making outputs look unrelated on-chain.

**Architecture:** Two layers: (1) fix the SP-UTXO spend path so it calls the `silent-payments` library's sender-side derivation (currently missing), enabling SP→SP sends at all; (2) before `coinselect`, expand a single `sp1` target into N same-address targets with randomised amounts — the library's k-counter loop handles the rest automatically. The UI adds a toggle to `SendDetails` (visible only for `sp1` addresses above 50k sats, not MAX) and a split-output-count row to `Confirm`.

**Tech Stack:** TypeScript, React Native, `silent-payments` npm lib (`SilentPayment.createTransaction`), `ecpair` (for WIF encoding), `class/rng.ts` (CSPRNG). No new native/Rust code.

---

## File Map

| File | Change |
|------|--------|
| `helpers/silent-payments/splitPayment.ts` | **New** — pure `computeSplitCount` + `splitAmount` helpers |
| `helpers/silent-payments/index.ts` | **Modify** — re-export the two new functions |
| `class/wallets/hd-bip352-wallet.ts` | **Modify** — wire SP derivation into `createSPTransaction`; add `splitPayment` param to `createTransaction` / `createSPTransaction` |
| `screen/send/SendDetails.tsx` | **Modify** — split toggle state + threading |
| `screen/send/Confirm.tsx` | **Modify** — output-count row when split is on |
| `navigation/SendDetailsStackParamList.ts` | **Modify** — add `splitPayment` to `Confirm` params |
| `loc/en.json` | **Modify** — add two new loc strings |
| `tests/unit/splitPayment.test.ts` | **New** — unit tests for the helper |
| `tests/unit/spSenderDerivation.test.ts` | **New** — round-trip derivation test |

---

## Task 1: `splitPayment.ts` — pure helper (TDD)

**Files:**
- Create: `helpers/silent-payments/splitPayment.ts`
- Create: `tests/unit/splitPayment.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/splitPayment.test.ts`:

```ts
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
    // 150k / 100k = 1.5 → rounds to 2; feasibility floor: floor(150k/25k) = 6 → no constraint
    expect(computeSplitCount(150_000)).toBe(2);
  });

  it('returns 3 at 250k sats', () => {
    // 250k / 100k = 2.5 → rounds to 3; feasibility floor: floor(250k/25k) = 10 → no constraint
    expect(computeSplitCount(250_000)).toBe(3);
  });

  it('returns 5 at 450k sats', () => {
    expect(computeSplitCount(450_000)).toBe(5);
  });

  it('caps at 5 beyond 500k sats', () => {
    expect(computeSplitCount(1_000_000)).toBe(5);
    expect(computeSplitCount(10_000_000)).toBe(5);
  });

  it('feasibility clamp: 3 outputs would need 75k but total is 60k → returns 2', () => {
    // 60k / 100k = 0.6 → rounds to 1, but min is 2 (clamp low), then feasibility: floor(60k/25k)=2 → 2
    expect(computeSplitCount(60_000)).toBe(2);
  });
});

describe('splitAmount', () => {
  it('returns exactly n values', () => {
    expect(splitAmount(200_000, 2)).toHaveLength(2);
    expect(splitAmount(300_000, 3)).toHaveLength(3);
  });

  it('all values sum exactly to total', () => {
    for (let trial = 0; trial < 20; trial++) {
      const total = 500_000;
      const parts = splitAmount(total, 3);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('each value is >= SPLIT_MIN_OUTPUT_SATS', () => {
    for (let trial = 0; trial < 20; trial++) {
      const parts = splitAmount(300_000, 3);
      for (const p of parts) {
        expect(p).toBeGreaterThanOrEqual(SPLIT_MIN_OUTPUT_SATS);
      }
    }
  });

  it('each value is a whole number of sats', () => {
    const parts = splitAmount(123_456, 2);
    for (const p of parts) {
      expect(Number.isInteger(p)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest tests/unit/splitPayment.test.ts --no-coverage
```

Expected: `FAIL` — `Cannot find module '../../helpers/silent-payments/splitPayment'`.

- [ ] **Step 3: Implement `splitPayment.ts`**

Create `helpers/silent-payments/splitPayment.ts`:

```ts
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
```

- [ ] **Step 4: Update tests to use `async` (splitAmount is async)**

Update `tests/unit/splitPayment.test.ts` — all `splitAmount` test bodies must `await`:

```ts
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
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx jest tests/unit/splitPayment.test.ts --no-coverage
```

Expected: all 8 tests `PASS`.

- [ ] **Step 6: Export from index**

In `helpers/silent-payments/index.ts`, add to the existing exports:

```ts
export { computeSplitCount, splitAmount, SPLIT_MIN_OUTPUT_SATS } from './splitPayment';
```

- [ ] **Step 7: Commit**

```bash
git add helpers/silent-payments/splitPayment.ts helpers/silent-payments/index.ts tests/unit/splitPayment.test.ts
git commit -m "feat(split): add splitPayment helper with computeSplitCount and splitAmount"
```

---

## Task 2: Wire sender-side SP derivation into `createSPTransaction`

This is the foundational fix. Currently `createSPTransaction` calls `psbt.addOutput({ address: 'sp1...' })` which bitcoinjs rejects. We call `sp.createTransaction(libUtxos, outputs)` instead, which resolves each `sp1` target to a real Taproot address (and assigns k-counters for multiple outputs to the same recipient).

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts`
- Create: `tests/unit/spSenderDerivation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/spSenderDerivation.test.ts`:

```ts
import { SilentPayment, UTXO as SPUTXO } from 'silent-payments';

// Reuse the BIP-352 test vector: one input, one SP recipient → one Taproot output
// from https://github.com/bitcoin/bips/blob/master/bip-0352/send_and_receive_test_vectors.json
// Simple sending case: p2tr input → sp1 recipient
const TEST_WIF = 'cTJZiLHePkBbSjPZsDhiHAbUNdmfHgdEvN5qJ3LD4TT6HxUBJJGa'; // privkey = 0xeadc...
const TEST_INPUT: SPUTXO = {
  txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
  vout: 0,
  wif: TEST_WIF,
  utxoType: 'p2tr',
};
const SP_ADDRESS = 'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2zn4d45g8n7l2ahzm3';

describe('SilentPayment.createTransaction sender derivation', () => {
  it('resolves a single sp1 target to a unique Taproot address', () => {
    const sp = new SilentPayment();
    const result = sp.createTransaction([TEST_INPUT], [{ address: SP_ADDRESS, value: 100_000 }]);
    expect(result).toHaveLength(1);
    expect(result[0].address).toBeTruthy();
    expect(result[0].address).not.toMatch(/^sp1/); // must be a resolved Taproot address
    expect(result[0].address).toMatch(/^bc1p/);    // bech32m Taproot
    expect(result[0].value).toBe(100_000);
  });

  it('produces two distinct Taproot addresses for two targets with the same sp1 address', () => {
    const sp = new SilentPayment();
    const result = sp.createTransaction(
      [TEST_INPUT],
      [
        { address: SP_ADDRESS, value: 60_000 },
        { address: SP_ADDRESS, value: 40_000 },
      ],
    );
    expect(result).toHaveLength(2);
    expect(result[0].address).toMatch(/^bc1p/);
    expect(result[1].address).toMatch(/^bc1p/);
    expect(result[0].address).not.toBe(result[1].address); // k=0 ≠ k=1
    expect(result[0].value).toBe(60_000);
    expect(result[1].value).toBe(40_000);
  });
});
```

- [ ] **Step 2: Run to confirm it passes (library test only)**

```bash
npx jest tests/unit/spSenderDerivation.test.ts --no-coverage
```

Expected: `PASS` — this verifies the library does what we expect before we wire it in.
If a test vector mismatch fails, adjust `TEST_WIF` / `SP_ADDRESS` to a vector that works;
the key assertion is that two targets → two distinct `bc1p` addresses.

- [ ] **Step 3: Wire the derivation into `createSPTransaction`**

In `class/wallets/hd-bip352-wallet.ts`, locate `createSPTransaction` (line ~794).

Add this import at the top of the file (it already imports `ECPairFactory` — add `SilentPayment`):

```ts
import { SilentPayment, UTXOType as SPUTXOType, UTXO as SPLibUTXO } from 'silent-payments';
```

Then inside `createSPTransaction`, replace the section between `coinselect` and building the PSBT. The current code at line ~804 is:

```ts
const { inputs, outputs, fee } = this.coinselect(spUtxos as CreateTransactionUtxo[], targets, feeRate);
const utxoMap = new Map(spUtxos.map(u => [`${u.txid}:${u.vout}`, u]));

this.ensurePendingInputsInitialized();
// ...
try {
  const spendPrivKey = this.getSpendPrivateKey();
  // ...
  outputs.forEach(output => {
    psbt.addOutput({
      address: output.address || changeAddress,
      value: BigInt(output.value),
    });
  });
```

Change it to resolve `sp1` outputs **before** adding them to the PSBT. Insert after `coinselect` and before `ensurePendingInputsInitialized`:

```ts
const { inputs, outputs: rawOutputs, fee } = this.coinselect(spUtxos as CreateTransactionUtxo[], targets, feeRate);
const utxoMap = new Map(spUtxos.map(u => [`${u.txid}:${u.vout}`, u]));

// Resolve sp1 targets to real Taproot addresses using sender-side BIP-352 derivation.
// The library groups targets by recipient and increments k for each output in the group.
let outputs = rawOutputs;
const hasSPOutput = rawOutputs.some(o => o.address?.startsWith('sp1'));
if (hasSPOutput) {
  const spendPrivKey = this.getSpendPrivateKey();
  const libUtxos: SPLibUTXO[] = inputs.map(input => {
    const spUtxo = utxoMap.get(`${input.txid}:${input.vout}`)!;
    const tweakedPrivKey = ecc.privateAdd(spendPrivKey, spUtxo.tweak);
    if (!tweakedPrivKey) throw new Error(`Failed to tweak privkey for ${input.txid}:${input.vout}`);
    const wif = ECPair.fromPrivateKey(Buffer.from(tweakedPrivKey), { compressed: true }).toWIF();
    return { txid: input.txid, vout: input.vout, wif, utxoType: 'p2tr' as SPUTXOType };
  });
  const sp = new SilentPayment();
  outputs = sp.createTransaction(libUtxos, rawOutputs) as typeof rawOutputs;
}

this.ensurePendingInputsInitialized();
```

Then in the `outputs.forEach` block (line ~857), ensure the change fallback still works:

```ts
outputs.forEach(output => {
  psbt.addOutput({
    address: output.address || changeAddress,
    value: BigInt(output.value),
  });
});
```

_(This line already exists — no change needed here.)_

- [ ] **Step 4: Run existing unit tests**

```bash
npm run unit
```

Expected: all existing unit tests pass. If any test creates an `HDSilentPaymentsWallet` and calls `createSPTransaction` with a regular address target — it should still work because non-`sp1` outputs bypass the derivation.

- [ ] **Step 5: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts tests/unit/spSenderDerivation.test.ts
git commit -m "fix(send): wire sender-side BIP-352 derivation into createSPTransaction"
```

---

## Task 3: Add `splitPayment` param and pre-coinselect expansion

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts`

- [ ] **Step 1: Update `createTransaction` signature**

In `class/wallets/hd-bip352-wallet.ts`, update the `createTransaction` method signature (line ~757) to accept `splitPayment`:

```ts
createTransaction(
  utxos: CreateTransactionUtxo[],
  targets: CreateTransactionTarget[],
  feeRate: number,
  changeAddress: string,
  sequence: number = AbstractHDElectrumWallet.finalRBFSequence,
  skipSigning = false,
  masterFingerprint: number = 0,
  splitPayment = false,
): CreateTransactionResult {
```

Then in the SP-only branch (line ~781), pass the flag through:

```ts
if (spUtxos.length > 0 && regularUtxos.length === 0) {
  return this.createSPTransaction(spUtxos, targets, feeRate, changeAddress, sequence, skipSigning, splitPayment);
}
```

- [ ] **Step 2: Update `createSPTransaction` signature and add pre-coinselect expansion**

Update the `createSPTransaction` signature to accept `splitPayment`, and make both it and `createTransaction` async:

```ts
// createTransaction becomes async too (it delegates to createSPTransaction which is now async):
async createTransaction(
  utxos: CreateTransactionUtxo[],
  targets: CreateTransactionTarget[],
  feeRate: number,
  changeAddress: string,
  sequence: number = AbstractHDElectrumWallet.finalRBFSequence,
  skipSigning = false,
  masterFingerprint: number = 0,
  splitPayment = false,
): Promise<CreateTransactionResult> {
```

```ts
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

> Both become `async` because `splitAmount` uses `randomBytes`. Update the SP-only branch in
> `createTransaction` to `return this.createSPTransaction(...)` (the outer `async` propagates the
> Promise automatically). Also check whether `createTransaction` is called synchronously anywhere
> in the parent class or UI — it is called in `SendDetails.tsx:566` which already needs `await`
> (see Task 5, Step 3). The parent class's `createTransaction` returns synchronously; since
> `HDSilentPaymentsWallet` overrides it, the override's signature change only affects callers
> that actually instantiate `HDSilentPaymentsWallet` (just `SendDetails.tsx`).

At the very top of `createSPTransaction`, before `coinselect`, insert the pre-expansion:

```ts
if (targets.length === 0) throw new Error('No destination provided');

// Pre-coinselect split expansion: replace the single sp1 target with N same-address targets.
let expandedTargets = targets;
if (splitPayment && targets.length === 1 && targets[0].address?.startsWith('sp1') && targets[0].value) {
  const n = computeSplitCount(targets[0].value);
  if (n > 1) {
    const amounts = await splitAmount(targets[0].value, n);
    expandedTargets = amounts.map(value => ({ address: targets[0].address!, value }));
  }
}

const { inputs, outputs: rawOutputs, fee } = this.coinselect(spUtxos as CreateTransactionUtxo[], expandedTargets, feeRate);
```

Add the import at the top of the file:

```ts
import { computeSplitCount, splitAmount } from '../../helpers/silent-payments/splitPayment';
```

> `computeSplitCount` and `splitAmount` are already exported from `helpers/silent-payments/index.ts` (Task 1, Step 6).

- [ ] **Step 3: Run unit tests**

```bash
npm run unit
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts
git commit -m "feat(split): add splitPayment param; expand targets before coinselect when toggled"
```

---

## Task 4: Add loc strings

**Files:**
- Modify: `loc/en.json`

- [ ] **Step 1: Add two new keys in the `"send"` object**

In `loc/en.json`, find the `"send"` object and add (keeping the existing keys):

```json
"split_payment": "Split payment",
"split_payment_outputs": "{{count}} outputs"
```

Place them near the other SP-related key `"cant_send_to_silentpayment_adress"`.

- [ ] **Step 2: Run lint to check JSON is valid**

```bash
npm run lint
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add loc/en.json
git commit -m "feat(split): add split_payment loc strings"
```

---

## Task 5: UI — Split toggle in `SendDetails`

**Files:**
- Modify: `screen/send/SendDetails.tsx`

The toggle is a `Pressable` that appears below the fee row, visible only when:
- recipient is a valid `sp1` address, AND
- amount ≥ 50,000 sats (`2 * SPLIT_MIN_OUTPUT_SATS`), AND
- not a MAX send.

Its state is threaded to `createPsbtTransaction` → `wallet.createTransaction`.

- [ ] **Step 1: Add import and state**

At the top of `SendDetails.tsx`, add:

```ts
import { SPLIT_MIN_OUTPUT_SATS } from '../../helpers/silent-payments/splitPayment';
```

Inside the `SendDetails` component, after the existing state declarations (around line ~82), add:

```ts
const [isSplitEnabled, setIsSplitEnabled] = useState(false);
```

- [ ] **Step 2: Add derived visibility boolean**

After `const isFormValid = !!recipient?.address && !isAmountEmpty(recipient?.amount);` (line ~93), add:

```ts
const isSplitEligible =
  !isMaxActive &&
  SilentPayment.isPaymentCodeValid(recipient?.address ?? '') &&
  Number(recipient?.amountSats) >= 2 * SPLIT_MIN_OUTPUT_SATS;
```

Also reset `isSplitEnabled` to `false` when the address changes so a previously toggled state doesn't carry over to a non-SP address:

```ts
const onChangeAddress = useCallback(
  (text: string) => {
    // ... existing body unchanged ...
    setIsSplitEnabled(false); // reset split when address changes
  },
  [setParams],
);
```

Add `setIsSplitEnabled(false)` as the last line inside the existing `onChangeAddress` callback body, **before** the closing `}` of the function and **before** `setIsLoading(false)` if present.

- [ ] **Step 3: Thread `isSplitEnabled` into `createPsbtTransaction`**

In `createPsbtTransaction` (line ~566), update the `createTransaction` call:

```ts
const { tx, outputs, psbt, fee } = await (wallet as HDSilentPaymentsWallet)?.createTransaction(
  lutxo,
  targets,
  requestedSatPerByte,
  change,
  isTransactionReplaceable ? HDSilentPaymentsWallet.defaultRBFSequence : HDSilentPaymentsWallet.finalRBFSequence,
  false,
  0,
  isSplitEnabled,
);
```

Note: `createTransaction` is now `async` (because `createSPTransaction` became async). Add `await`.

- [ ] **Step 4: Add the toggle to the render**

In the JSX return (after the fee `Pressable` that ends around line ~897, before `<DismissKeyboardInputAccessory />`), add:

```tsx
{isSplitEligible && (
  <Pressable
    accessibilityRole="button"
    testID="splitPaymentToggle"
    onPress={() => setIsSplitEnabled(v => !v)}
    style={[styles.feeSummary, stylesHook.feeSummary]}
  >
    <View style={styles.feeSummaryTexts}>
      <Text style={[styles.feeSummaryLabel, stylesHook.feeSummaryLabel]}>{loc.send.split_payment}</Text>
    </View>
    <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colors.chevron,
      backgroundColor: isSplitEnabled ? colors.brandPrimary : 'transparent',
      alignItems: 'center', justifyContent: 'center' }}>
      {isSplitEnabled && <Text style={{ color: colors.white, fontSize: 14 }}>✓</Text>}
    </View>
  </Pressable>
)}
```

> No inline styles allowed per project rules (`react-native/no-inline-styles` is an error). Move the toggle container style to the `StyleSheet` at the bottom of the file:

Add to the `StyleSheet.create({...})` at line ~921:

```ts
splitToggle: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 12,
  paddingHorizontal: 0,
},
splitCheckbox: {
  width: 24,
  height: 24,
  borderRadius: 4,
  borderWidth: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
splitCheckboxCheck: {
  fontSize: 14,
},
```

And reference them in the JSX:

```tsx
{isSplitEligible && (
  <Pressable
    accessibilityRole="button"
    testID="splitPaymentToggle"
    onPress={() => setIsSplitEnabled(v => !v)}
    style={[styles.feeSummary, stylesHook.feeSummary]}
  >
    <View style={styles.feeSummaryTexts}>
      <Text style={[styles.feeSummaryLabel, stylesHook.feeSummaryLabel]}>{loc.send.split_payment}</Text>
    </View>
    <View style={[styles.splitCheckbox, { borderColor: colors.chevron, backgroundColor: isSplitEnabled ? colors.brandPrimary : 'transparent' }]}>
      {isSplitEnabled && <Text style={[styles.splitCheckboxCheck, { color: colors.white }]}>✓</Text>}
    </View>
  </Pressable>
)}
```

> The `borderColor` and `backgroundColor` on `splitCheckbox` remain dynamic (theme-dependent) and cannot be in a static `StyleSheet` — these two inline properties are acceptable. All sizing/layout is in the stylesheet.

- [ ] **Step 5: Run type-check and lint**

```bash
npm run tslint && npm run lint
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add screen/send/SendDetails.tsx loc/en.json
git commit -m "feat(split): add split payment toggle to SendDetails"
```

---

## Task 6: UI — Output count row in `Confirm`

**Files:**
- Modify: `navigation/SendDetailsStackParamList.ts`
- Modify: `screen/send/SendDetails.tsx`
- Modify: `screen/send/Confirm.tsx`

When split is on, `Confirm` shows a "Split outputs" row so the user sees N outputs + the higher fee before broadcasting.

- [ ] **Step 1: Add `splitOutputCount` to Confirm route params**

In `navigation/SendDetailsStackParamList.ts`, update the `Confirm` entry:

```ts
Confirm: {
  fee: number;
  memo?: string;
  walletID: string;
  tx: string;
  recipients: CreateTransactionTarget[];
  satoshiPerByte: number;
  splitOutputCount?: number;
};
```

- [ ] **Step 2: Pass `splitOutputCount` from `SendDetails`**

In `screen/send/SendDetails.tsx`, inside `createPsbtTransaction`, update the `navigation.navigate('Confirm', {...})` call:

```ts
const spOutputCount = isSplitEnabled ? recipients.length : undefined;

navigation.navigate('Confirm', {
  fee: new BigNumber(fee).dividedBy(100000000).toNumber(),
  memo: transactionMemo,
  walletID: wallet.getID(),
  tx: tx.toHex(),
  recipients,
  satoshiPerByte: requestedSatPerByte,
  splitOutputCount: spOutputCount,
});
```

- [ ] **Step 3: Display the count row in `Confirm`**

In `screen/send/Confirm.tsx`:

1. Destructure the new param:

```ts
const { recipients, walletID, fee, tx, splitOutputCount } = route.params;
```

2. Add to the `loc.send` imports at the top — `loc` is already imported. No change needed; use `loc.send.split_payment_outputs` below.

3. After the `<ConfirmDetailRow ... label={loc.send.transaction_id} .../>` block and before the fee summary row, insert:

```tsx
{splitOutputCount !== undefined && splitOutputCount > 1 && (
  <>
    <View style={[styles.divider, stylesHook.divider]} />
    <ConfirmDetailRow
      label={loc.send.split_payment}
      value={loc.send.split_payment_outputs.replace('{{count}}', String(splitOutputCount))}
    />
  </>
)}
```

- [ ] **Step 4: Run type-check and lint**

```bash
npm run tslint && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add navigation/SendDetailsStackParamList.ts screen/send/SendDetails.tsx screen/send/Confirm.tsx
git commit -m "feat(split): show split output count in Confirm screen"
```

---

## Task 7: Full test run and verification

- [ ] **Step 1: Run all unit tests**

```bash
npm run unit
```

Expected: all pass, including `splitPayment.test.ts` and `spSenderDerivation.test.ts`.

- [ ] **Step 2: Run type-check and lint**

```bash
npm run tslint && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Run integration tests (optional, requires network)**

```bash
npm run integration
```

Expected: all pass (split logic is purely in wallet-layer; no new Electrum calls).

- [ ] **Step 4: Final commit (if anything was left unstaged)**

```bash
git status
# If clean, nothing to do. If dirty, stage + commit with appropriate message.
```

---

## Spec Coverage Check

| Spec section | Task(s) covering it |
|---|---|
| §4 Split algorithm (`computeSplitCount`, `splitAmount`, constants) | Task 1 |
| §5 Sender-side SP derivation (wire `sp.createTransaction` in `createSPTransaction`) | Task 2 |
| §6 Flow: `splitPayment` param, pre-coinselect expansion | Task 3 |
| §7 UI toggle in `SendDetails` | Task 5 |
| §7 Confirm output count display | Task 6 |
| §8 Edge cases (MAX disabled, `<50k` disabled, non-`sp1` hidden) | Task 5 (`isSplitEligible`) + Task 1 (`computeSplitCount` returns 1) |
| §10 Unit tests for helper | Task 1 |
| §10 Derivation round-trip test | Task 2 |
| §10 Regression: existing tests pass | Task 7 |
