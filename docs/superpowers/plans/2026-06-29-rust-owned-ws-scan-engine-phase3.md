# Rust-Owned WS Scan Engine — Phase 3: wire the engine in + flip the flag + cleanup + Phase 4 deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the Rust-owned WS engine the live scan path: wire `performScan` to `streamViaRustEngine` (progress→UI+lastScannedBlock, match→commit, error→HTTP fallback), advance/persist scan height from progress events, flip `useRustOwnedStream` on, remove the freeze-era progress band-aid (`MIN_VISIBLE_SCAN_MS`), and delete the now-dead JS WebSocket loop.

**Architecture:** The engine emits `progress`/`match`/`done`/`error`. JS owns only UI + wallet-state: progress advances `lastScannedBlock` (throttled persist) and drives the banner; rare `match` events resolve metadata and commit UTXOs; `error{unsupported|socket}` falls back to the existing HTTP range scan. The legitimate render-dedup fixes stay; only the artificial visibility delay and the replaced JS WS loop are removed.

**Tech Stack:** TypeScript, the Phase-2 `streamViaRustEngine` bridge + native engine, existing `RustTransactionProcessor`/`IndexerHttpClient`, Jest.

## Global Constraints

- **The Rust engine is the primary WS path once the flag is on; the HTTP range scan (`scanBlocks`/`scanForwardWithCallback`) remains the fallback.** Do not delete the HTTP fallback.
- **Keep, do not remove:** `_scanStateEquals` (wallet), the StorageProvider functional-updater dedup, and SyncScreen's progress-primitive `useEffect` deps. These fixed a real "Maximum update depth exceeded" infinite loop and matter MORE now (the engine emits progress ~10×/sec). Removing them reintroduces the loop.
- **Remove:** `MIN_VISIBLE_SCAN_MS` and its `setTimeout` delay — a band-aid added because the frozen UI made progress jump straight to 100%. Real incremental progress replaces it.
- **Match events carry no `isSpent`/`blockHash`/`blockTime`** — resolve them via the existing `getTransactionByTxid` (rare; matches are uncommon), exactly as the binary path does today.
- **`lastScannedBlock` must never advance past a height that failed to scan.** On the engine path it advances from `progress.currentBlock` (the engine only reports heights it has scanned) and to `endHeight` on `done`. On fallback it advances per range as today.
- Persisting on every progress event (~10×/sec) would thrash disk: throttle persistence on progress; guarantee a final persist on `done`/`pause`/`cancel`/app-background.
- Commit after each task with the exact message given. Gate: `npx jest tests/unit` (no new regressions) + the named focused tests. Final gate: on-device Android scan with the flag on.

## File Structure

| File | Change |
|------|--------|
| `helpers/silent-payments/RustTransactionProcessor.ts` | add `convertRawMatches(rawUtxos, address)` reusing the existing converter |
| `class/wallets/hd-bip352-wallet.ts` | split commit flow (`addUTXOs` / `advanceScanHeight`); engine path in `performScan`; progress advances height + throttled persist; remove `MIN_VISIBLE_SCAN_MS` |
| `modules/constants.ts` | `useRustOwnedStream = true` |
| `modules/SilentPaymentIndexer.ts` | remove `streamForwardWithCallback` (JS WS loop entry); keep HTTP scan + `deriveWsUrl` |
| `modules/SilentBlockStreamClient.ts` | delete `streamSilentBlocks` + WS helpers; keep `streamViaRustEngine`, `deriveWsUrl`, `StreamUnsupportedError`, types |
| `screen/wallets/SyncScreen.tsx` | (cleanup, scope-confirmed) |
| `tests/unit/*` | engine-path wiring + persistence-throttle tests |

---

## Task 1: `RustTransactionProcessor.convertRawMatches` + wallet commit-flow split

**Files:**
- Modify: `helpers/silent-payments/RustTransactionProcessor.ts`
- Modify: `class/wallets/hd-bip352-wallet.ts`
- Test: `tests/unit/scannable-wallet.test.ts` (extend)

**Interfaces:**
- Produces:
  - `RustTransactionProcessor.convertRawMatches(rawUtxos: Array<{txid,vout,value,height,pubKey,tweakHex}>, silentPaymentAddress: string): SilentPaymentUTXO[]` — wraps the existing private `convertToSilentPaymentUTXO` (placeholder isSpent/blockHash/blockTime).
  - `HDSilentPaymentsWallet.addUTXOs(utxos): number` — adds, fires balance callback, persists; does NOT touch `lastScannedBlock`.
  - `HDSilentPaymentsWallet.advanceScanHeight(height: number, opts?: {persist?: boolean}): void` — advances `lastScannedBlock` monotonically; persists when `opts.persist` (throttled by caller).
  - `commitUTXOs` is re-expressed as `addUTXOs` + `advanceScanHeight(rangeEnd, {persist:true})` so the HTTP-fallback handlers keep identical behavior.

- [ ] **Step 1: Write the failing test** — assert `convertRawMatches` maps a raw match to a `SilentPaymentUTXO` (address derived from `pubKey`, `tweak` from `tweakHex`, placeholder isSpent=false), and that `addUTXOs` adds without changing `lastScannedBlock` while `advanceScanHeight` advances it monotonically (never backwards).

```typescript
// tests/unit/scannable-wallet.test.ts (add)
it('convertRawMatches maps engine matches to SilentPaymentUTXO with placeholders', () => {
  // build a wallet/processor, call convertRawMatches with one raw match, assert fields
});
it('addUTXOs does not advance lastScannedBlock; advanceScanHeight is monotonic', () => {
  // addUTXOs([...]) -> lastScannedBlock unchanged; advanceScanHeight(100) then (50) -> stays 100
});
```

- [ ] **Step 2: Run RED**, then implement `convertRawMatches` (reuse `convertToSilentPaymentUTXO`), `addUTXOs`, `advanceScanHeight`, and recompose `commitUTXOs = addUTXOs + advanceScanHeight`. Run GREEN; run `npx jest tests/unit/scannable-wallet.test.ts`.

- [ ] **Step 3: Commit** — `feat(scan): convertRawMatches + split wallet commit into addUTXOs/advanceScanHeight`.

---

## Task 2: wire `performScan` to the engine behind the flag (with HTTP fallback)

**Files:**
- Modify: `class/wallets/hd-bip352-wallet.ts`
- Modify: `modules/SilentPaymentIndexer.ts` (add a thin `streamViaEngine(...)` that calls `streamViaRustEngine` with the derived wsUrl + keys — keeps the wallet free of JSI details), OR call `streamViaRustEngine` from the wallet with `deriveWsUrl(indexer.getBaseUrl())`.
- Test: `tests/unit/silentPaymentIndexerScan.test.ts` (extend) — mock `global.spScanStart` to drive progress/match/done and assert lastScannedBlock advance + UTXO commit + fallback on `unsupported`.

**Interfaces:**
- Consumes: `streamViaRustEngine` (Phase 2), `convertRawMatches`/`addUTXOs`/`advanceScanHeight` (Task 1), `useRustOwnedStream` flag, existing `scanForwardWithCallback` HTTP fallback, `resolveMatchMetadata`.

- [ ] **Step 1: Write the failing test** — with the flag on and `global.spScanStart` mocked: a `progress` event advances `lastScannedBlock` to `currentBlock`; a `match` event commits a UTXO (after metadata resolve, mock `getTransactionByTxid`); `done` resolves; an `error{code:"unsupported"}` triggers the HTTP fallback (`getSilentBlocksRange` spy called). 

- [ ] **Step 2: Run RED**, then implement in `performScan`:
  - Build an engine handler `onMatch(rawUtxos)`: `const resolved = await this.resolveMatchMetadata(this.transactionProcessor.convertRawMatches(rawUtxos, addr)); this.addUTXOs(resolved);`
  - `wrappedProgress`: in addition to the existing `_emitScanState`/ETA, call `this.advanceScanHeight(progress.currentBlock, {persist: <throttled>})` (throttle in Task 3).
  - Replace the `try streamForwardWithCallback(...)` with: `if (useRustOwnedStream) { try { await indexer.streamViaEngine(startHeight, endHeight, { onMatch }, wrappedProgress, cancel); } catch (e) { if (SCAN_CANCELLED) throw; /* unsupported|socket */ <HTTP fallback as today> } } else { <existing streamForwardWithCallback path> }` — keep the existing fallback block verbatim.
  - On `done` (engine resolved): `this.advanceScanHeight(endHeight, {persist:true})`.
- Run GREEN; run the focused suite.

- [ ] **Step 3: Commit** — `feat(scan): wire performScan to the Rust engine behind the flag, HTTP fallback on error`.

---

## Task 3: persistence throttle on progress

**Files:** `class/wallets/hd-bip352-wallet.ts`; test in `tests/unit/scannable-wallet.test.ts`.

- [ ] **Step 1: Write the failing test** — feed many rapid progress events; assert `onPersistCallback` fires at most ~once per `SCAN_PERSIST_THROTTLE_MS` (e.g. 3000ms, use fake timers) and exactly once more on `done` (final flush), while `lastScannedBlock` updates in memory on every event.

- [ ] **Step 2: Run RED**, then add `SCAN_PERSIST_THROTTLE_MS = 3000` and a `_lastPersistTime`; `advanceScanHeight(h, {persist})` updates `lastScannedBlock` always but only calls `onPersistCallback` when `persist && now - _lastPersistTime >= throttle`. Force a persist on `done`/`pause`/`cancel`. (Check `pauseScan`/`cancelScan`/app-background paths call a guaranteed persist.) Run GREEN.

- [ ] **Step 3: Commit** — `feat(scan): throttle scan-height persistence; guaranteed flush on done/pause/cancel`.

---

## Task 4: flip the flag + remove the `MIN_VISIBLE_SCAN_MS` band-aid

**Files:** `modules/constants.ts`, `class/wallets/hd-bip352-wallet.ts`.

- [ ] **Step 1:** Set `export const useRustOwnedStream = true;` (kept as a kill-switch; the engine still falls back to HTTP on error).
- [ ] **Step 2:** Remove the `MIN_VISIBLE_SCAN_MS` constant (line ~34) and the `if (elapsed < MIN_VISIBLE_SCAN_MS) { await setTimeout(...) }` block (~634-636). Real incremental progress now makes the scan perceptible.
- [ ] **Step 3:** `npx jest tests/unit` — full suite green (no new regressions).
- [ ] **Step 4: Commit** — `feat(scan): enable Rust-owned stream; drop artificial min-visible-scan delay`.

---

## Task 5: Phase 4 — delete the dead JS WebSocket loop

**Files:** `modules/SilentBlockStreamClient.ts`, `modules/SilentPaymentIndexer.ts`.

With the engine live and the HTTP fallback intact, the JS WS loop is unreachable.

- [ ] **Step 1:** Delete `streamSilentBlocks` and its private helpers (`concatChunks`, `readUint32BE`, the `StreamSilentBlocksParams` type, heartbeat/timer logic) from `SilentBlockStreamClient.ts`. **Keep** `streamViaRustEngine`, `deriveWsUrl`, `StreamUnsupportedError`, `RustStreamHandlers`, and the event types.
- [ ] **Step 2:** Remove `streamForwardWithCallback` from `SilentPaymentIndexer.ts` and its `streamSilentBlocks` import; keep `scanForwardWithCallback`/`scanBlocks` (HTTP), `deriveWsUrl`, and `streamViaEngine` (Task 2). Remove any now-dead `ScanRangeHandlers.processBinaryRange` usage only if fully unreferenced (the HTTP fallback still uses it — keep).
- [ ] **Step 3:** Grep for dangling references (`streamSilentBlocks`, `streamForwardWithCallback`); fix imports. `npx jest tests/unit` green; delete/trim the obsolete `streamSilentBlocks`-specific unit tests if any.
- [ ] **Step 4: Commit** — `refactor(scan): delete dead JS WebSocket loop (engine owns streaming now)`.

---

## Task 6: on-device verification (Android, flag on)

- [ ] Build + install (`./gradlew :app:installDebug`), Metro running. Trigger a full backfill scan.
- [ ] Verify: UI stays responsive during the scan; the progress bar advances incrementally (not a 0→100 jump); block height climbs; matched UTXOs/balance are correct; pause/resume/cancel work; kill+relaunch resumes from the persisted `lastScannedBlock`.
- [ ] Check logcat for the engine's `wss://` connect + no native crash. If the indexer doesn't support `sync`, confirm the HTTP fallback engages and the scan still completes.

---

## Carried / deferred
- iOS: same wiring is JS-shared (no iOS-specific code in Phase 3); device-verify on a Mac after the iOS native build (separate).
- The `useRustOwnedStream` kill-switch flag can be removed in a later cleanup once the engine is proven in production.
- SyncScreen `showDone` completion UX: see the cleanup-scope decision recorded with this plan (kept unless confirmed otherwise).
