# External Spend Detection for SP UTXOs — Design

**Date:** 2026-07-04
**Branch:** `fix/mix-utxo`
**Status:** Approved

## Problem

When an SP UTXO belonging to the wallet is spent from another wallet (e.g. Sparrow, using the same
seed), this wallet keeps showing the output as unspent, so the displayed balance is inflated. The
stale UTXO can also be offered to coin selection, producing transactions that spend already-spent
inputs.

### Root cause (traced end-to-end)

The sync protocol has no channel that can carry a spend event:

1. SP UTXOs live in `_utxo` with an `isSpent` flag; `getBalance()`
   (`class/wallets/hd-bip352-wallet.ts:652`) counts the `!isSpent` ones.
2. The **only** caller of `markUTXOAsSpent` is the wallet's own broadcast path
   (`hd-bip352-wallet.ts:1016`). External spends have no code path that reaches it.
3. Scanning is strictly forward-only: `performScan` scans `lastScannedBlock + 1` → tip via
   `/transactions/range?filterSpent=true`. That endpoint returns *unspent received outputs* of the
   scanned blocks. A spend of an already-discovered UTXO happens in a later block, but scanning
   that later block only reports the block's own outputs — never its inputs. The receiving block is
   behind `lastScannedBlock` and is never revisited. External spends are invisible by construction.

### What the indexer already provides

No indexer change is required for detection — the data exists and is served:

- `EsploraProvider.processBlock` collects **every input of every tx** in each block as
  `spentOutpoints` and calls `StorageService.markOutputsSpent`, which flips the output's `isSpent`
  byte and removes it from the unspent index. This covers spending txs that are not themselves
  SP-eligible (the Sparrow case).
- `/transactions/txid/:txid` returns per-output `isSpent`; the height/range endpoints with
  `filterSpent=true` omit spent outputs entirely (a fully spent tx disappears from the response).

Indexer limitations that bound this design (accepted, see Out of scope):

- **Confirmed-only.** The indexer has no mempool view; spends are detected at 1 confirmation.
- **Reorg gap.** `traceReorg` deletes a reorged-out block's own transactions but never un-marks
  outputs *spent by* that block — `isSpent` stays true. (Indexer bug, to be filed.)
- **No spender txid.** `isSpent` is a bool; "which tx spent it" is not stored, so the external
  spending transaction cannot be shown in history.

## Decision

**Wallet-only recheck now (Approach A); indexer per-block spent-outpoint index later (Approach C).**

Alternatives considered:

- **Per-txid recheck** (`/transactions/txid/:txid` per UTXO): simpler bookkeeping, but reveals the
  wallet's exact transaction set to the indexer — defeats SP light-client privacy. Rejected.
- **Electrum recheck via derived P2TR addresses**: the only option that catches mempool spends, but
  links one-off SP addresses to the wallet's Electrum session and adds a second source of truth.
  Rejected.
- **Approach C first**: cleanest end-state (spend events consumed during the normal forward scan)
  but requires indexer storage, endpoint, backfill, and reorg work before the wallet bug is fixed —
  and the wallet still needs a one-time recheck for UTXOs whose spend blocks are already behind
  `lastScannedBlock`. Deferred, not rejected; see Future work.

The height-batched recheck reuses the same range endpoint the scan already uses, so the indexer
learns only block heights of interest — the same granularity it already sees from scan traffic.

## Fix

All changes live in `class/wallets/hd-bip352-wallet.ts` (plus tests). No UI changes, no indexer
changes, no new endpoints, no new persisted state.

### New private method: `recheckSpentStatus(indexerTip: number)`

1. **Candidates:** `getSilentPaymentUTXOs()` filtered to `!isSpent`, excluding any with
   `height > indexerTip`. The tip guard prevents a wiped or re-syncing indexer (whose responses
   would be empty) from reading as "everything spent".
2. **Batch:** collect candidates' distinct block heights, sort ascending, greedily group into
   windows of ≤ 50 blocks (the indexer's `MAX_BLOCK_RANGE`). One
   `getTransactionsByRange(start, end)` call per window (the existing method; it already hardcodes
   `filterSpent=true`).
3. **Compare:** build a `txid:vout` set from each successful response. A candidate whose outpoint
   is absent from a *successfully fetched* window → `markUTXOAsSpent(txid, vout)` (existing method;
   already persists via `onPersistCallback` and fires `onBalanceChangeCallback`). A failed request
   skips its window — absence only means spent when the fetch succeeded.
4. **One-directional:** the recheck only marks spent, never un-marks. It cannot resurrect UTXOs the
   wallet spent locally (pending in mempool), and its worst failure direction under-reports balance
   rather than over-reporting.

### Trigger: inside `performScan`, gated by tip movement

`performScan` already fetches `latestHeight` on every run, and every sync path funnels through it
(pull-to-refresh via `fetchTransactions` → `scanForSilentPayments`, polling via `startPolling`,
catch-up after offline, `forceFullScan` rescans). Run the recheck there — **including before the
"no new blocks" early-returns** — gated by an in-memory `_lastSpentCheckHeight`:

- Skip when `latestHeight <= _lastSpentCheckHeight` (no new block ⇒ no new confirmed spend).
- Set `_lastSpentCheckHeight = latestHeight` only after a recheck in which every window fetch
  succeeded, so a recheck with failed windows is retried on the next scan pass (the gate was not
  advanced).
- Deliberately **not persisted**: every app session rechecks once. That is also the migration path
  that repairs wallets already carrying stale UTXOs — their spend blocks are behind
  `lastScannedBlock`, where the forward scan will never look.

A recheck failure must not fail the scan: wrap it so scan results and `lastScannedBlock` semantics
are untouched.

### Edge cases

| Case | Behavior |
| --- | --- |
| External spend still in mempool | Not detectable (indexer is confirmed-only). Shows until 1 conf. Wallet's own spends are already marked at broadcast. |
| Receive tx reorged out | Outpoint absent → marked spent → excluded from balance. Balance-correct; the history entry remains (refinement deferred to Approach C). |
| Spending tx reorged out | Indexer keeps `isSpent=true` (indexer bug, filed separately). Wallet mirrors it: under-reports, never over-reports. |
| Rescan (`forceFullScan`) | `filterSpent=true` scanning cannot re-add spent UTXOs; the recheck cleans up existing stale entries that the rescan cannot touch. |
| Indexer wiped / re-syncing | Tip guard skips candidates above the indexer tip; empty state cannot mass-mark UTXOs spent. |
| Wallet's own pending spends | Already `isSpent=true` locally → not candidates → recheck cannot interfere with `_sp_pending_inputs`. |

## Testing

Unit tests alongside the existing `hd-bip352-wallet` tests, mocking the indexer module
(`getDefaultIndexer`):

1. Outpoint absent from range response → marked spent, `getBalance()` drops, persist + balance
   callbacks fired.
2. Outpoint present → untouched.
3. Range fetch throws → UTXOs in that window untouched; other windows still processed;
   `_lastSpentCheckHeight` not advanced.
4. Candidate height > indexer tip → skipped.
5. Second recheck at the same tip → no HTTP calls (tip gate).
6. Heights within one 50-block window → one range call; distant heights → separate calls.

Manual verification: fund the wallet, spend one of its SP UTXOs from Sparrow, confirm a block, then
pull-to-refresh — balance drops and the UTXO stops appearing in `getUtxo()`.

## Out of scope / future work

- **Approach C (indexer, separate workstream):** persist the per-block spent-outpoint list that
  `markOutputsSpent` already computes, serve it (e.g. `/spent-outpoints/range`), and have the
  wallet consume it during the normal forward scan — event-sourced spend detection with zero extra
  requests and zero privacy delta. Also unlocks showing the external spending tx in history if the
  spender txid is stored. The recheck built here remains the repair/rescan path afterwards.
- **Indexer bug filings:** (1) reorg does not revert `isSpent` for outputs spent by the reorged-out
  block; (2) known `encodeVarInt` multi-byte CompactSize corruption affecting the binary
  silent-block format.
- Mempool-level detection of external spends.
