# External Spend Detection for SP UTXOs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark SP UTXOs as spent when they are spent from another wallet (e.g. Sparrow), so balance and coin selection stay correct.

**Architecture:** A new private `recheckSpentStatus(indexerTip)` method on `HDSilentPaymentsWallet` re-fetches the block heights of its unspent SP UTXOs from the indexer's existing `filterSpent=true` range endpoint; a tracked outpoint absent from a successful response is marked spent via the existing `markUTXOAsSpent`. The method is triggered from `performScan` (every sync path funnels through it), gated by an in-memory last-checked tip. No indexer changes, no new endpoints, no new persisted state.

**Tech Stack:** TypeScript (React Native), Jest for unit tests.

**Spec:** `docs/superpowers/specs/2026-07-04-external-spend-detection-design.md`

## Global Constraints

- Wallet-only change: no indexer changes, no new HTTP endpoints, no UI changes (SendDetails/Confirm screens are Figma-locked — do not touch them).
- No new persisted state: `_lastSpentCheckHeight` is in-memory only; do NOT add it to `prepareForSerialization`/`fromJson`.
- One-directional: the recheck only marks UTXOs spent, never un-marks them.
- Range requests must span ≤ 50 blocks (indexer `MAX_BLOCK_RANGE = 50` rejects larger).
- Absence of an outpoint only means "spent" when the range fetch **succeeded**; a failed window must leave its UTXOs untouched.
- A recheck failure must never fail or abort the scan.
- Commit message style follows repo convention: `FIX:`/`TST:`/`DOC:` prefix.
- Run commands from the worktree root: `/home/sahil/dev/silent-pay-wallet/.claude/worktrees/fix+external-spend-detection`.

## File Structure

- Modify: `class/wallets/hd-bip352-wallet.ts` — one new field, one new private method, one call site in `performScan`.
- Create: `tests/unit/bip352-spent-recheck.test.ts` — all tests for this feature (kept separate from `tests/unit/bip352.test.ts` because it needs `jest.mock` of the indexer module, which the existing file must not inherit).

---

### Task 1: `recheckSpentStatus` method

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts` (field near line 44, method after `markUTXOAsSpent` ~line 227)
- Test: `tests/unit/bip352-spent-recheck.test.ts` (create)

**Interfaces:**
- Consumes (all existing): `getSilentPaymentUTXOs(): SilentPaymentUTXO[]` (private), `markUTXOAsSpent(txid: string, vout: number): boolean` (private, fires persist + balance callbacks), `getDefaultIndexer().getTransactionsByRange(start: number, end: number): Promise<TransactionResponse>` (already hardcodes `filterSpent=true`).
- Produces: `private async recheckSpentStatus(indexerTip: number): Promise<void>` and `private _lastSpentCheckHeight: number` — Task 2 calls the method from `performScan`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/bip352-spent-recheck.test.ts`:

```ts
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';
import { getDefaultIndexer } from '../../modules/SilentPaymentIndexer';
import { type SilentPaymentUTXO } from '../../helpers/silent-payments/types.ts';

jest.mock('../../modules/SilentPaymentIndexer', () => ({
  getDefaultIndexer: jest.fn(),
}));

const mockGetDefaultIndexer = getDefaultIndexer as jest.Mock;

const TXID_A = '11'.repeat(32);
const TXID_B = '22'.repeat(32);

function makeUtxo(txid: string, vout: number, height: number, overrides: Partial<SilentPaymentUTXO> = {}): SilentPaymentUTXO {
  return {
    txid,
    vout,
    value: 10_000,
    height,
    address: 'bc1ptest',
    silentPaymentAddress: 'sp1qtest',
    pubKey: 'aa'.repeat(32),
    tweak: new Uint8Array(32),
    blockHash: '',
    blockTime: 0,
    isSpent: false,
    ...overrides,
  };
}

// Builds a filterSpent=true range response containing exactly the given outpoints.
function rangeResponse(outpoints: { txid: string; vout: number; height: number }[]) {
  const byTxid = new Map<string, typeof outpoints>();
  for (const op of outpoints) {
    const list = byTxid.get(op.txid) ?? [];
    list.push(op);
    byTxid.set(op.txid, list);
  }
  return {
    transactions: [...byTxid.entries()].map(([txid, ops]) => ({
      id: txid,
      blockHeight: ops[0].height,
      blockHash: '',
      blockTime: 0,
      scanTweak: '',
      outputs: ops.map(op => ({ transactionId: txid, vout: op.vout, pubKey: '', value: 10_000, isSpent: false })),
    })),
  };
}

describe('recheckSpentStatus', () => {
  let wallet: HDSilentPaymentsWallet;
  let rangeMock: jest.Mock;

  beforeEach(() => {
    wallet = new HDSilentPaymentsWallet();
    rangeMock = jest.fn();
    mockGetDefaultIndexer.mockReturnValue({ getTransactionsByRange: rangeMock });
  });

  function seed(utxo: SilentPaymentUTXO): void {
    (wallet as any).addUTXO(utxo);
  }

  it('marks a UTXO spent when its outpoint is absent from the range response', async () => {
    const onBalanceChange = jest.fn();
    const onPersist = jest.fn();
    wallet.setOnBalanceChangeCallback(onBalanceChange);
    wallet.setOnPersistCallback(onPersist);
    seed(makeUtxo(TXID_A, 0, 100));
    expect(wallet.getBalance()).toBe(10_000);

    rangeMock.mockResolvedValue({ transactions: [] });
    await (wallet as any).recheckSpentStatus(200);

    expect(rangeMock).toHaveBeenCalledWith(100, 100);
    expect(wallet.getUTXOs()).toHaveLength(0);
    expect(wallet.getBalance()).toBe(0);
    expect(onBalanceChange).toHaveBeenCalled();
    expect(onPersist).toHaveBeenCalled();
  });

  it('leaves a UTXO untouched when its outpoint is present', async () => {
    seed(makeUtxo(TXID_A, 0, 100));
    rangeMock.mockResolvedValue(rangeResponse([{ txid: TXID_A, vout: 0, height: 100 }]));

    await (wallet as any).recheckSpentStatus(200);

    expect(wallet.getUTXOs()).toHaveLength(1);
    expect(wallet.getBalance()).toBe(10_000);
  });

  it('does not mark UTXOs in a window whose fetch failed, and retries them on the next pass', async () => {
    seed(makeUtxo(TXID_A, 0, 100));
    seed(makeUtxo(TXID_B, 0, 500));
    rangeMock.mockImplementation(async (start: number) => {
      if (start === 100) throw new Error('network');
      return { transactions: [] };
    });

    await (wallet as any).recheckSpentStatus(600);

    // Failed window (height 100) untouched; successful window (height 500) marked spent.
    expect(wallet.getUTXOs().map(u => u.txid)).toEqual([TXID_A]);

    // Gate not advanced: a repeat call at the same tip re-fetches the failed window.
    rangeMock.mockClear();
    rangeMock.mockResolvedValue({ transactions: [] });
    await (wallet as any).recheckSpentStatus(600);
    expect(rangeMock).toHaveBeenCalledWith(100, 100);
    expect(wallet.getUTXOs()).toHaveLength(0);
  });

  it('skips candidates above the indexer tip', async () => {
    seed(makeUtxo(TXID_A, 0, 300));

    await (wallet as any).recheckSpentStatus(200);

    expect(rangeMock).not.toHaveBeenCalled();
    expect(wallet.getUTXOs()).toHaveLength(1);
  });

  it('skips a repeat recheck at the same tip after a fully successful pass', async () => {
    seed(makeUtxo(TXID_A, 0, 100));
    rangeMock.mockResolvedValue(rangeResponse([{ txid: TXID_A, vout: 0, height: 100 }]));

    await (wallet as any).recheckSpentStatus(200);
    await (wallet as any).recheckSpentStatus(200);

    expect(rangeMock).toHaveBeenCalledTimes(1);
  });

  it('groups nearby heights into one 50-block window and distant heights into separate ones', async () => {
    seed(makeUtxo(TXID_A, 0, 100));
    seed(makeUtxo(TXID_A, 1, 149));
    seed(makeUtxo(TXID_B, 0, 300));
    rangeMock.mockResolvedValue({ transactions: [] });

    await (wallet as any).recheckSpentStatus(400);

    expect(rangeMock).toHaveBeenCalledTimes(2);
    expect(rangeMock).toHaveBeenNthCalledWith(1, 100, 149);
    expect(rangeMock).toHaveBeenNthCalledWith(2, 300, 300);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/bip352-spent-recheck.test.ts`
Expected: FAIL — every test throws `TypeError: wallet.recheckSpentStatus is not a function` (or similar).

- [ ] **Step 3: Implement the method**

In `class/wallets/hd-bip352-wallet.ts`, add the field directly below `private lastScannedBlock: number = 0;` (line 44):

```ts
  // Indexer tip as of the last fully successful spent-status recheck. In-memory only:
  // every app session rechecks once, which also repairs wallets persisted with stale UTXOs.
  private _lastSpentCheckHeight: number = 0;
```

Add the method directly after `markUTXOAsSpent` (after line ~227):

```ts
  /**
   * Re-verify unspent SP UTXOs against the indexer and mark externally-spent ones
   * (e.g. spent from Sparrow). Uses the same filterSpent=true range endpoint as the
   * scan, so the indexer only learns block heights, never exact outpoints. Absence
   * of a tracked outpoint from a successful response means it is spent (or its tx
   * was reorged out) — either way it must not count toward the balance.
   * One-directional: only marks spent, never un-marks.
   */
  private async recheckSpentStatus(indexerTip: number): Promise<void> {
    if (indexerTip <= this._lastSpentCheckHeight) return;

    // Tip guard: a wiped or re-syncing indexer returns empty ranges above its tip,
    // which must not read as "everything spent".
    const candidates = this.getSilentPaymentUTXOs().filter(u => !u.isSpent && u.height > 0 && u.height <= indexerTip);
    if (candidates.length === 0) {
      this._lastSpentCheckHeight = indexerTip;
      return;
    }

    const indexer = getDefaultIndexer();
    const heights = [...new Set(candidates.map(u => u.height))].sort((a, b) => a - b);

    // Greedily group heights into windows of <=50 blocks (indexer MAX_BLOCK_RANGE).
    const windows: { start: number; end: number }[] = [];
    for (const height of heights) {
      const last = windows[windows.length - 1];
      if (last && height <= last.start + 49) {
        last.end = height;
      } else {
        windows.push({ start: height, end: height });
      }
    }

    let allSucceeded = true;
    for (const { start, end } of windows) {
      let present: Set<string>;
      try {
        const response = await indexer.getTransactionsByRange(start, end);
        present = new Set(response.transactions.flatMap(tx => tx.outputs.map(o => `${tx.id}:${o.vout}`)));
      } catch (error) {
        console.warn(`[SP] recheckSpentStatus: range ${start}-${end} failed:`, error);
        allSucceeded = false; // gate below stays put, so this window is retried on a later pass
        continue;
      }

      for (const utxo of candidates) {
        if (utxo.height >= start && utxo.height <= end && !present.has(`${utxo.txid}:${utxo.vout}`)) {
          this.markUTXOAsSpent(utxo.txid, utxo.vout);
        }
      }
    }

    if (allSucceeded) {
      this._lastSpentCheckHeight = indexerTip;
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/bip352-spent-recheck.test.ts`
Expected: PASS — 6 passed.

Run: `npm run tslint`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts tests/unit/bip352-spent-recheck.test.ts
git commit -m "FIX: add spent-status recheck for SP UTXOs"
```

---

### Task 2: Trigger the recheck from `performScan`

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts` (`performScan`, insertion after the `latestHeight` validation, ~line 426)
- Test: `tests/unit/bip352-spent-recheck.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `recheckSpentStatus(indexerTip: number)` and `_lastSpentCheckHeight` from Task 1; existing `performScan` locals `indexer`, `latestHeight`.
- Produces: nothing new — behavioral guarantee that every `scanForPayments()` pass runs the recheck (before the "no new blocks" early-returns) and that recheck failures never fail the scan.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/bip352-spent-recheck.test.ts` (uses `makeUtxo`, `mockGetDefaultIndexer`, `TXID_A` from Task 1):

```ts
describe('performScan spent-recheck trigger', () => {
  it('runs the recheck even when there are no new blocks to scan', async () => {
    const wallet = new HDSilentPaymentsWallet();
    const rangeMock = jest.fn().mockResolvedValue({ transactions: [] });
    mockGetDefaultIndexer.mockReturnValue({
      getLatestBlockHeight: jest.fn().mockResolvedValue({ height: 200 }),
      getTransactionsByRange: rangeMock,
      scanForwardWithCallback: jest.fn(),
    });
    (wallet as any).addUTXO(makeUtxo(TXID_A, 0, 100));
    (wallet as any).lastScannedBlock = 200; // startHeight 201 > tip 200 → forward scan early-returns

    await wallet.scanForPayments();

    expect(rangeMock).toHaveBeenCalledWith(100, 100);
    expect(wallet.getUTXOs()).toHaveLength(0);
  });

  it('completes the scan even when every recheck fetch fails', async () => {
    const wallet = new HDSilentPaymentsWallet();
    mockGetDefaultIndexer.mockReturnValue({
      getLatestBlockHeight: jest.fn().mockResolvedValue({ height: 200 }),
      getTransactionsByRange: jest.fn().mockRejectedValue(new Error('boom')),
      scanForwardWithCallback: jest.fn(),
    });
    (wallet as any).addUTXO(makeUtxo(TXID_A, 0, 100));
    (wallet as any).lastScannedBlock = 200;

    await expect(wallet.scanForPayments()).resolves.toBe(0);
    expect(wallet.getUTXOs()).toHaveLength(1); // untouched — failed window never marks spent
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest tests/unit/bip352-spent-recheck.test.ts`
Expected: the first new test FAILS (`rangeMock` never called — `performScan` early-returns before any recheck exists). The second may pass already (resolves to 0); that is fine — it pins the non-fatal behavior. The 6 Task 1 tests still pass.

- [ ] **Step 3: Insert the trigger**

In `performScan` (`class/wallets/hd-bip352-wallet.ts`), directly after:

```ts
      if (latestHeight <= 0) {
        throw new Error(`Invalid latest block height: ${latestHeight}`);
      }
```

insert (before `let startHeight: number;` so it also runs on the "no new blocks" early-return paths):

```ts
      // Detect externally-spent UTXOs (e.g. spent from another wallet) before the
      // forward scan: the scan only ever sees new blocks' outputs, never spends of
      // already-discovered ones. Never fail the scan because of the recheck.
      try {
        await this.recheckSpentStatus(latestHeight);
      } catch (error) {
        console.warn('[SP] Spent-status recheck failed:', error);
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/bip352-spent-recheck.test.ts`
Expected: PASS — 8 passed.

Run: `npx jest tests/unit/bip352.test.ts`
Expected: PASS — existing SP tests unaffected.

Run: `npm run tslint`
Expected: no type errors.

- [ ] **Step 5: Run the full unit suite**

Run: `npm run unit`
Expected: PASS (same result as the pre-change baseline).

- [ ] **Step 6: Commit**

```bash
git add class/wallets/hd-bip352-wallet.ts tests/unit/bip352-spent-recheck.test.ts
git commit -m "FIX: recheck SP UTXO spent status on every scan pass"
```

---

## Manual Verification (after both tasks)

1. Run the app against a regtest/testnet indexer, fund the SP wallet, note the balance.
2. Spend one of the wallet's SP UTXOs from Sparrow (same seed) and mine/await 1 confirmation.
3. Pull-to-refresh in the wallet: balance drops by the spent UTXO's value and the outpoint no longer appears in coin control (`getUtxo()`).
4. Known limitation (by design, see spec): while the Sparrow spend is unconfirmed, the balance is unchanged.
