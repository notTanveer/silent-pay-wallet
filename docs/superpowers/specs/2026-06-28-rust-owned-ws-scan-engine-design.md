# Rust-Owned WebSocket Scan Engine — Design

**Date:** 2026-06-28
**Status:** Approved for planning
**Branch context:** `feat/scan-speed-test`

## Problem

During a silent-payment backfill scan over the WebSocket path, two things break:

1. **The UI freezes** for the duration of the scan — the JS thread is blocked, so React cannot render and animations stop.
2. **The progress bar never updates** mid-scan — it appears or jumps to 100% only once the scan has already finished.

Both must be fixed at the root, not patched.

## Root cause (single, architectural)

The expensive operation in the entire pipeline is the Rust ECDH scan of silent-block
frames. Today it runs **synchronously on the JS thread** via a blocking JSI host
function:

- `performScan` → `streamForwardWithCallback` → `streamSilentBlocks` opens the
  WebSocket **on the JS thread**.
- Each binary frame hits `ws.onmessage` **on the JS thread**, is buffered, and at
  ~1.5 MB is handed to `processBinaryRange` → `processSilentBlockFrames` →
  `spScanSilentBlockRange(...)`.
- `RustJsiBridge.cpp` (`Function::createFromHostFunction`) calls
  `sp_scan_silent_block_range(...)` **synchronously and returns the result inline** —
  no thread, no CallInvoker, no async.

React Native runs all JS on one thread. While Rust crunches, that thread is parked
inside the FFI call: no microtasks, no timers, no `setScanState`, no `Animated` ticks.
During a multi-thousand-block backfill these blocking calls run back-to-back, so the
thread is pegged the whole scan.

- **UI freeze** is a direct consequence: nothing JS-driven can run.
- **Progress never renders** for the same reason: `setScanState` is called, but
  React's render/commit is scheduled on the JS thread, which never goes idle between
  the back-to-back synchronous Rust calls until the scan ends — so React batches and
  paints once, at 100%. The progress bar's `Animated.timing(useNativeDriver: false)`
  is JS-driven and frozen too.

The recent `MIN_VISIBLE_SCAN_MS`, `showDone`, and "infinite render loop" commits are
workarounds for this symptom, not the cause.

### Bottlenecks, ranked

1. **Synchronous Rust scan on the JS thread** — ~99% of the problem.
2. WS receive + ~1.5 MB `concatChunks` memcpy on the JS thread — cheap (sub-ms).
3. `JSON.parse` of the scan result — tiny (matches only, usually zero).

The WS loop living in JS is **not** the cause. The sole cause is heavy CPU work
blocking the single JS thread.

## Goals

- The JS thread runs **only** UI rendering and lightweight control/event handling
  during a scan — never scan-data processing.
- **Real, smooth progress** updates emitted on a wall-clock cadence (~100 ms),
  decoupled from batch boundaries, that React can render.
- Scan throughput **equal or better** than today (network receive overlaps CPU scan).
- Cancel / pause / resume / resume-after-restart all preserved.
- Works on **both iOS and Android**.

## Non-goals

- Rewriting the scanner crypto core (`scan_transaction`, `parse_silent_block_frames`,
  `process_transactions_parallel` are reused unchanged).
- Changing React components, `SyncScreen`, or the progress-bar visuals.
- Rust owning the HTTP fallback path or match-metadata resolution — both stay in JS.
- Reworking polling or ETA logic.

## Chosen architecture

A long-lived **Rust scan engine** on its own native thread (tokio runtime) owns the
WebSocket primary path end to end. JS becomes a thin controller + renderer. The
**HTTP range-scan fallback stays in JS** (rare, older-indexer path) but its per-range
scan moves off the JS thread via an `await`-able async scan call, so it no longer
freezes either.

Two architecture decisions were taken explicitly by the product owner during review:

- **Rust owns the actual TLS WebSocket socket**, not just the scan loop (the heavier,
  higher-risk option, chosen deliberately).
- **HTTP fallback is kept in JS**, trimming an entire HTTPS/networking dependency from
  Rust.

### Responsibility boundary

**Rust (native thread):**
- TLS WebSocket connection (`tokio-tungstenite` + `rustls`), `sync` handshake, native
  ping heartbeat, first-frame and idle-stall timeouts.
- Frame parse + ECDH scan (reusing existing scanner functions).
- Height tracking, batching, rate-limited progress emission (~100 ms).
- Cancel / pause / resume signaling.
- Zeroizes the scan key on `done`/`cancel`.

**JS (main thread — only this):**
- `spScanStart` / `spScanPause` / `spScanResume` / `spScanCancel` calls.
- Event handling: `progress`, `match`, `done`, `error`.
- On `progress` → advance `lastScannedBlock` (in memory), `setScanState` (render),
  ETA, **throttled** persist.
- On `match` (rare) → resolve isSpent/blockHash/blockTime via the existing
  `getTransactionByTxid`, `addUTXO`/`commitUTXOs`, persist. Wallet-state mutation and
  storage stay entirely in JS.
- On `done`/`error` → finalize; `error{unsupported|socket}` triggers the HTTP fallback.
- The HTTP fallback loop (`scanBlocks`), now using the async off-thread scan call.

### Why this fixes both bugs permanently

The JS thread never runs scan-data processing again: no synchronous FFI, no per-frame
buffering, no `concatChunks`. It sits idle except for tiny event callbacks, so React
renders freely and `Animated` ticks. Progress is genuine because Rust emits it on a
wall-clock cadence it controls, decoupled from batch boundaries. Throughput is
equal-or-better: the scan runs full-speed on a dedicated thread while the socket keeps
receiving (true pipelining).

## Native module API (JS ↔ Rust contract)

The existing bridge is pure-JSI (host functions on `global`); this keeps that style.
Five new host functions:

```
spScanStart(configJson: string, onEvent: (eventJson: string) => void): void
spScanPause(): void
spScanResume(): void
spScanCancel(): void
spScanSilentBlockRangeAsync(scanPriv, spendPub, framesBuffer: ArrayBuffer): Promise<string>  // fallback
```

- **`onEvent`** is a JS function retained native-side (`shared_ptr<jsi::Function>`) and
  invoked **only on the JS thread via the CallInvoker** from the tokio thread.
- **`configJson`** carries `wsUrl`, `from`, `to`, `filterSpent`, `scanPrivkeyHex`,
  `spendPubkeyHex`, and tunables (`progressIntervalMs ≈ 100`, `firstFrameTimeoutMs`,
  `idleTimeoutMs`, `heartbeatIntervalMs`, internal `flushBytes`).
- **Event stream** (`eventJson`, one of):
  - `{type:"progress", currentBlock, tipHeight, totalBlocks, blocksScanned, percentComplete, utxosFound}` — ≤ every ~100 ms.
  - `{type:"match", utxos:[{txid,vout,value,height,pubKey,tweakHex}]}` — raw matches.
  - `{type:"done"}` — server reported `synced` and all batches scanned.
  - `{type:"error", code:"unsupported"|"stalled"|"socket"|..., message}`.

Single scan at a time → one global session (`Mutex<Option<Session>>`); cancel flips an
atomic the loop polls.

## Rust engine internals

**Runtime:** one dedicated OS thread hosting a tokio runtime, created on first
`spScanStart`. Socket I/O is async on the tokio reactor; the **CPU scan runs via
`spawn_blocking`** (lands on rayon — `process_transactions_parallel` already
parallelizes within a batch). This is the pipelining crux: while batch *N* scans, the
reactor drains frames *N+1*.

**Ordering:** batches scan one at a time in height order (like the current JS
`processingChain`), so progress and `lastScannedBlock` advance monotonically.
Parallelism lives inside a batch (rayon) and across the network/CPU boundary — not
across batches.

**Data flow:**
```
reactor task:   WS recv frame ─→ bounded channel ─→ scanner task
scanner task:   drain until flushBytes ─→ spawn_blocking(scan) ─→ collect matches
emit (throttled): progress (≤100ms) / match / done / error ─→ CallInvoker ─→ onEvent(JS)
```
The **bounded channel** gives backpressure for free: if the scan falls behind, the
channel fills, the reactor stops reading, and TCP backpressure throttles the server.
Bounded memory; no unbounded `pending` growth.

WS frames use the same self-describing `height(4 BE)|len(4 BE)|blob` format the HTTP
endpoint returns, so `parse_silent_block_frames` + `scan_transaction` are reused
unchanged.

**Progress emitter:** a coalescing throttle — at most one `progress` per
`progressIntervalMs`, driven by frames received (bar moves with the stream, not batch
boundaries), plus a guaranteed final 100%.

**State machine:** `Connecting → SyncSent → Streaming → Draining → Done|Error`.
- **Heartbeat:** tokio interval sends native WS Ping; Pong resets the idle-stall timer.
- **Pause:** scanner stops pulling from the channel; socket stays alive via heartbeat;
  reactor backpressures. **Resume:** scanner resumes draining.
- **Cancel:** abort tasks, close socket, zeroize key, emit nothing further.
- **`unsupported` detection:** connect failure / close-before-data / first-frame
  timeout → `error{code:"unsupported"}`. Mid-stream drop → `error{code:"socket"}`.

**Matches** are emitted as `match` events (raw, per scan batch). Rust never resolves
metadata or touches wallet storage.

## JS integration & deletions

**`SilentPaymentIndexer.streamForwardWithCallback`** becomes a thin event bridge:

```
streamForwardWithCallback(start, end, handlers, onProgress, cancel) → Promise:
  spScanStart(configJson, onEvent)
  onEvent(json):
    progress → onProgress(progress)
    match    → handlers.onMatch(rawUtxos)
    done     → resolve()
    error    → reject(StreamUnsupportedError | Error)   // by code
```

**`hd-bip352-wallet.performScan`** keeps its shape; wiring re-targets to events:
- `progress` → `wrappedProgress`: `setScanState` (render) + advance
  `lastScannedBlock = currentBlock`; ETA unchanged.
- `match` (rare) → `resolveMatchMetadata` → `addUTXO` → balance-change + persist.
- `done` → finalize, idle, polling handoff.
- `error{unsupported|socket}` → existing HTTP fallback from `lastScannedBlock + 1`.

**Persistence cadence change (the one real behavioral change):** today `commitUTXOs`
persists per batch. Progress now fires ~every 100 ms, so persisting per progress would
thrash disk. Advance `lastScannedBlock` in memory on each progress, but **throttle the
persist** (≈ every 3 s or every N blocks) with a guaranteed flush on
`done`/`pause`/`cancel`/app-background. Keeps resume-after-restart correct without
disk thrash.

**Deleted:**
- **`modules/SilentBlockStreamClient.ts` in its entirety** (~330 lines): the JS WS
  loop, `streamSilentBlocks`, heartbeat, timers, `concatChunks`, `readUint32BE`, frame
  parsing, dual progress emission. All move into Rust.

**Untouched (just receives smoother state):**
- `SyncScreen`, `ScanProgressBar`, `StorageProvider`, the whole React tree.
- `IndexerHttpClient` and the `scanBlocks` HTTP fallback loop (now async scan).
- The Rust scanner core — reused, not rewritten.

`MIN_VISIBLE_SCAN_MS` / `showDone` UI workarounds stay as-is (harmless; out of scope) —
noted as optional later cleanup.

## Build, dependencies & native plumbing (the risk surface)

**New Rust deps (`rust_jsi_bridge/Cargo.toml`):**
- `tokio` (`rt`, `net`, `time`, `sync`, `macros`) — single-thread runtime on one
  dedicated OS thread.
- `tokio-tungstenite` + `rustls` + `webpki-roots` — WS over TLS. **Use the `ring`
  crypto backend, not `aws-lc-rs`** (`ring` cross-compiles cleanly to mobile targets;
  `aws-lc-rs` is a known mobile cross-compile headache).
- `webpki-roots` (bundled Mozilla root store) rather than on-device cert stores — the
  Cloudflare tunnel serves a normal public cert; a bundled store validates it with zero
  platform cert-store access. SNI set to host.
- `futures-util`; `zeroize` for the scan key.
- Adds ~1–3 MB per ABI to the native lib and longer Rust build times. Acceptable.

**TLS parity:** mirror `deriveWsUrl` — `https→wss` (rustls), `http→ws` (plaintext,
dev/local). tungstenite picks the connector by scheme.

**FFI shape (Rust ↔ C++):** Rust can't touch JSI, so:
```
Rust exports:  sp_scan_start(config_json, emit_cb, ctx) -> session_ok
               sp_scan_pause() / sp_scan_resume() / sp_scan_cancel()
   emit_cb:    extern "C" fn(ctx, *const u8, len)   // event JSON, from tokio thread
```
C++ `emit_cb` copies the bytes and does
`callInvoker->invokeAsync([...]{ onEvent(jsiString); })` so the JS callback only fires
on the JS thread.

**CallInvoker plumbing (the one genuinely new native bit):**
- **iOS:** `installJSIBindings(runtime, callInvoker)` — pass `cxxBridge.jsCallInvoker`
  from the existing `install` in `RustJsiBridgeModule.mm`. Easy.
- **Android:** thread `CallInvokerHolderImpl`
  (`reactContext.getCatalystInstance().getJSCallInvokerHolder()`) into the JNI
  `nativeInstall`, unwrap to `shared_ptr<CallInvoker>` via
  `<ReactCommon/CallInvokerHolder.h>`, link `reactnativejni`/jsiCallInvoker in
  `CMakeLists.txt`. Standard, moderate.

**`spScanSilentBlockRangeAsync` (fallback):** standard async-JSI Promise pattern —
create a `Promise`, capture resolve/reject, run the scan on a worker thread, resolve
via the same CallInvoker.

**Build files touched:** `Cargo.toml`; iOS staticlib targets + `RustJsiBridge.cpp` +
`.mm` + headers; Android `cargo-ndk` for all ABIs + `rust-jsi-bridge-jni.cpp` + shared
`RustJsiBridge.cpp/.h` + `CMakeLists.txt` + the Kotlin module passing the call-invoker
holder. **CI needs the Rust mobile targets + cargo-ndk/lipo.**

**Top risks, stated plainly:**
1. `ring` on `armv7-linux-androideabi` is the historically flaky target — validate that
   ABI first.
2. Binary-size bump.
3. First `wss://` handshake through the tunnel on a real device is the integration
   moment of truth — test it before wiring the UI.

## Testing strategy

- **Rust unit tests:** keep existing scanner correctness tests. Factor the scan loop to
  read from an abstract async byte stream so it is testable without a live socket; test
  frame accumulation/flush boundaries, progress-throttle coalescing, cancel atomic, and
  height monotonicity against an in-memory frame source.
- **Rust integration:** a local mock indexer WS server (or the real indexer) exercising
  first-frame, streaming, `synced`, ping/pong, mid-stream drop, and unsupported
  (immediate close). Validate the event sequence.
- **JS unit tests:** the event-bridge mapping (progress/match/done/error → callbacks),
  fallback trigger on `unsupported`, persistence throttle, monotonic
  `lastScannedBlock`, match resolution + commit. Mock the native module
  (`global.spScanStart`, etc.).
- **Device smoke (iOS + Android, incl. armv7):** full backfill from birth height —
  verify (a) UI stays responsive (scroll/animations during scan), (b) progress bar
  advances smoothly, (c) matches found correctly, (d) cancel/pause/resume,
  (e) resume-after-kill from persisted `lastScannedBlock`.
- **Perf check:** scan wall-clock no worse than current; main-thread frame drops ~0
  during scan (vs. fully pegged today).

## Rollout & rollback

- **Staged delivery:**
  1. Land CallInvoker plumbing + `spScanSilentBlockRangeAsync`; ship and verify the
     fallback path no longer freezes. (Smaller, lower-risk, independently valuable.)
  2. Land the Rust WS engine behind a runtime flag (`useRustOwnedStream`).
  3. Validate on-device, then flip the flag on.
  4. Delete `SilentBlockStreamClient.ts`.
- **Rollback path:** if `spScanStart` is unavailable (older binary) or the flag is off,
  JS skips the WS path and uses the HTTP range scan (now async) directly. The HTTP
  fallback is the always-present safety net — no native rollback required.

## Trade-offs (accepted)

- Large native surface, new heavy deps (`tokio`/`rustls`/`ring`), cross-compile + TLS
  risk, binary-size bump, CI changes — accepted in exchange for a permanently clean JS
  thread and Rust-controlled progress cadence.
- WS protocol/heartbeat/timeouts move from JS (deleted) into Rust — net not duplicated,
  since the JS version is removed. Only the HTTP fallback remains in JS.
- The async-JSI fallback function is a smaller, lower-risk win that also fixes the
  fallback freeze; worth landing first regardless of the rest.
