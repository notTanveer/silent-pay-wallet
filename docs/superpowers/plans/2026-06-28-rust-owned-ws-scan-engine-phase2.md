# Rust-Owned WS Scan Engine — Phase 2: Rust WebSocket engine behind a flag

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a long-lived Rust scan engine that owns the silent-block WebSocket end to end (connect, stream, parse, scan, emit throttled progress/match/done/error events to JS via the Phase 1 CallInvoker), exposed through new JSI host functions and a JS event-bridge gated behind a default-OFF `useRustOwnedStream` flag. Phase 2 builds and tests the engine in isolation; **Phase 3 wires it into `performScan` and flips the flag.**

**Architecture:** A dedicated OS thread hosts a tokio current-thread runtime. The reactor owns the `wss://` socket (`tokio-tungstenite` + `rustls`/`ring` + `webpki-roots`); received frames flow through a bounded channel to a scanner that batches them and runs the **existing** `parse_silent_block_frames` + `process_transactions_parallel` on `spawn_blocking`. A coalescing emitter pushes events (≤ every ~100 ms) to JS through a C `emit_cb` → CallInvoker → JS `onEvent`. A global single-session manager (`Mutex<Option<SessionHandle>>`) backs `sp_scan_start/pause/resume/cancel`.

**Tech Stack:** Rust (edition 2024, `staticlib`), `tokio` (current-thread), `tokio-tungstenite`, `rustls` with the **`ring`** provider, `webpki-roots`, `futures-util`, `zeroize`, `serde`/`serde_json` (already present); the existing `secp256k1`/`rayon` scanner; JSI host functions (Obj-C++/JNI, duplicated per platform); the Phase 1 `CallInvoker` plumbing; TypeScript + Jest.

## Global Constraints

- **This phase changes no scan crypto.** Reuse `parse_silent_block_frames(bytes: &[u8]) -> Result<Vec<IndexerTransaction>, String>` and `process_transactions_parallel(&SecretKey, &PublicKey, &[IndexerTransaction]) -> BatchScanResult` verbatim. Matched UTXOs use the existing `MatchedUTXO` serde type (camelCase: `txid,vout,value,height,pubKey,tweakHex,blockHash,blockTime,isSpent`).
- **The binary format omits `isSpent`/`blockHash`/`blockTime`** — the engine emits matches with those fields left at their parse defaults; JS resolves them later (Phase 3). Do not add network metadata resolution to Rust.
- **rustls MUST use the `ring` provider, not `aws-lc-rs`.** Set it explicitly via crate features; `aws-lc-rs` is a mobile cross-compile hazard.
- **TLS roots come from `webpki-roots`** (bundled Mozilla store) — no on-device cert-store access. Set SNI to the URL host.
- **WS scheme parity:** `wss://` → rustls TLS connector; `ws://` → plaintext (dev/local only).
- **The engine is single-session.** `sp_scan_start` while a session is active returns an error; it does not queue.
- **The scan key is sensitive:** parse it, hold it only for the session, and `zeroize` it on done/cancel/drop. Never log it.
- **`useRustOwnedStream` defaults to `false`.** Phase 2 must not change runtime behavior for existing users; the engine is reachable only when the flag is explicitly enabled in a test/dev build.
- **JSI host functions are duplicated** across `ios/RustJsiBridge/RustJsiBridge.cpp` and `android/app/src/main/cpp/RustJsiBridge.cpp`. iOS native work is **deferred to macOS** (this host is Linux); Android C++ is build-verifiable here. Mark iOS steps `[DEFERRED — macOS]`.
- Commit after each task with the exact message given. Android verification gate is `cd android && ./gradlew :app:assembleDebug` → `BUILD SUCCESSFUL`. Rust gate is `cargo test` (host) + the per-task cross-compile build.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `rust_jsi_bridge/Cargo.toml` | crate deps | Add tokio/tokio-tungstenite/rustls(ring)/webpki-roots/futures-util/zeroize |
| `rust_jsi_bridge/src/lib.rs` | crate root | `mod stream_engine;` |
| `rust_jsi_bridge/src/stream_engine/mod.rs` | engine public surface + FFI | `ScanConfig`, `ScanEvent`, `EmitFn`, `sp_scan_start/pause/resume/cancel`, session manager |
| `rust_jsi_bridge/src/stream_engine/session.rs` | scan loop over an abstract frame source | bounded channel, batching, spawn_blocking scan, throttle, pause/cancel |
| `rust_jsi_bridge/src/stream_engine/ws.rs` | WS transport | connect/handshake/heartbeat/timeouts feeding the session |
| `ios/RustJsiBridge/RustJsiBridge.cpp` | iOS JSI bindings | `spScanStart/Pause/Resume/Cancel` `[DEFERRED — macOS]` |
| `android/app/src/main/cpp/RustJsiBridge.cpp` | Android JSI bindings | `spScanStart/Pause/Resume/Cancel` |
| `modules/RustJsiBridge.ts` | TS wrappers | `spScanStart/Pause/Resume/Cancel` wrappers + event types |
| `modules/SilentBlockStreamClient.ts` | streaming entry | add `streamViaRustEngine()` (the new event-bridge); leave existing JS loop intact |
| `modules/constants.ts` | flags | `export const useRustOwnedStream = false;` |
| `tests/unit/rustStreamEngineBridge.test.ts` | JS bridge test | Create |

---

## Task 1: Dependencies + Android cross-compile spike (de-risk the build first)

**Why first:** the single biggest Phase 2 risk is whether `tokio` + `tokio-tungstenite` + `rustls`(`ring`) cross-compile for every Android ABI. This host has `cargo-ndk` and all four Android Rust targets, so we prove it before writing the engine.

**Files:**
- Modify: `rust_jsi_bridge/Cargo.toml`
- Modify: `rust_jsi_bridge/src/lib.rs` (temporary link-check fn)

**Interfaces:**
- Produces: the dependency set the rest of Phase 2 compiles against; a confirmed cross-compile for `aarch64`, `armv7`, `x86_64`, `i686` Android.

- [ ] **Step 1: Add dependencies to `rust_jsi_bridge/Cargo.toml`**

Append to `[dependencies]`:

```toml
tokio = { version = "1", default-features = false, features = ["rt", "net", "time", "sync", "macros", "io-util"] }
tokio-tungstenite = { version = "0.24", default-features = false, features = ["connect", "rustls-tls-webpki-roots"] }
futures-util = { version = "0.3", default-features = false, features = ["sink", "std"] }
rustls = { version = "0.23", default-features = false, features = ["ring", "std", "tls12"] }
webpki-roots = "0.26"
zeroize = "1"
```

Add to `[dev-dependencies]`:

```toml
tokio = { version = "1", features = ["rt", "net", "time", "sync", "macros", "io-util", "rt-multi-thread"] }
```

> The spike validates these exact versions. If `tokio-tungstenite 0.24`'s feature name differs in the resolved version, the implementer pins the version that exposes a `rustls` + `webpki-roots` connector with the `ring` provider and records the resolved versions in the report.

- [ ] **Step 2: Add a temporary link-check function to `rust_jsi_bridge/src/lib.rs`**

At the end of the file, add (this forces the linker to pull in the async/TLS stack so the spike actually exercises cross-compilation):

```rust
// TEMPORARY (Task 1 spike): forces the async/TLS deps to link on every target.
// Removed in Task 4 when the real engine references them.
#[allow(dead_code)]
#[doc(hidden)]
pub fn __ws_link_check() -> usize {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    rt.block_on(async {
        // Reference the TLS roots + connector type so they are not dead-code-eliminated.
        let roots = webpki_roots::TLS_SERVER_ROOTS.len();
        let _ = tokio::time::sleep(std::time::Duration::from_millis(0)).await;
        roots
    })
}
```

- [ ] **Step 3: Build the host crate and run the existing tests**

Run: `cd rust_jsi_bridge && cargo build && cargo test`
Expected: compiles; existing scanner tests still pass.

- [ ] **Step 4: Cross-compile all four Android ABIs**

Run from `rust_jsi_bridge/`:
```bash
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 build --release
```
(Equivalently `cargo build --release --target <t>` for each of `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`, `i686-linux-android`.)
Expected: **all four targets link successfully.** `armv7-linux-androideabi` is the historically fragile one — if `ring` fails there, that is the signal to stop and resolve (NDK version / `CC`/`AR` env) before any further Phase 2 work.

- [ ] **Step 5: Record resolved versions and commit**

Capture the resolved crate versions: `cargo tree -p rustls -p tokio-tungstenite -p ring | head -40` into the report.

```bash
git add rust_jsi_bridge/Cargo.toml rust_jsi_bridge/Cargo.lock rust_jsi_bridge/src/lib.rs
git commit -m "build(rust): add tokio/tokio-tungstenite/rustls(ring) deps; verify Android cross-compile"
```

> If any ABI fails to link and cannot be resolved by NDK/env adjustment, STOP and escalate — the full-Rust-WS architecture depends on this compiling, and that decision belongs to the human.

---

## Task 2: Rust — `ScanConfig`, `ScanEvent`, and event serialization

**Files:**
- Create: `rust_jsi_bridge/src/stream_engine/mod.rs`
- Modify: `rust_jsi_bridge/src/lib.rs` (add `mod stream_engine;`)

**Interfaces:**
- Produces:
  - `ScanConfig { ws_url: String, from: u32, to: u32, filter_spent: bool, scan_privkey_hex: String, spend_pubkey_hex: String, progress_interval_ms: u64, first_frame_timeout_ms: u64, idle_timeout_ms: u64, heartbeat_interval_ms: u64, flush_bytes: usize }` — `Deserialize`, camelCase, with serde defaults for the tunables.
  - `ScanEvent` enum serializing to the exact JSON the JS bridge consumes:
    `{"type":"progress",...}`, `{"type":"match","utxos":[...]}`, `{"type":"done"}`, `{"type":"error","code":"...","message":"..."}`.
  - `fn scan_event_json(ev: &ScanEvent) -> String`.

- [ ] **Step 1: Write the failing test**

In `rust_jsi_bridge/src/stream_engine/mod.rs`, start the file with the types and a `#[cfg(test)]` module:

```rust
use serde::{Deserialize, Serialize};
use crate::MatchedUTXO;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanConfig {
    pub ws_url: String,
    pub from: u32,
    pub to: u32,
    #[serde(default = "default_true")]
    pub filter_spent: bool,
    pub scan_privkey_hex: String,
    pub spend_pubkey_hex: String,
    #[serde(default = "default_progress_interval")]
    pub progress_interval_ms: u64,
    #[serde(default = "default_first_frame_timeout")]
    pub first_frame_timeout_ms: u64,
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout_ms: u64,
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval_ms: u64,
    #[serde(default = "default_flush_bytes")]
    pub flush_bytes: usize,
}

fn default_true() -> bool { true }
fn default_progress_interval() -> u64 { 100 }
fn default_first_frame_timeout() -> u64 { 15_000 }
fn default_idle_timeout() -> u64 { 30_000 }
fn default_heartbeat_interval() -> u64 { 20_000 }
fn default_flush_bytes() -> usize { 1_500_000 }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub current_block: u32,
    pub tip_height: u32,
    pub total_blocks: u32,
    pub blocks_scanned: u32,
    pub percent_complete: f64,
    pub utxos_found: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScanEvent {
    Progress(ProgressPayload),
    Match { utxos: Vec<MatchedUTXO> },
    Done,
    Error { code: String, message: String },
}

pub fn scan_event_json(ev: &ScanEvent) -> String {
    serde_json::to_string(ev).unwrap_or_else(|e| {
        format!("{{\"type\":\"error\",\"code\":\"serialize\",\"message\":\"{}\"}}", e)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_parses_with_defaults() {
        let json = r#"{"wsUrl":"wss://x/","from":1,"to":10,"scanPrivkeyHex":"aa","spendPubkeyHex":"bb"}"#;
        let cfg: ScanConfig = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.from, 1);
        assert_eq!(cfg.to, 10);
        assert!(cfg.filter_spent);
        assert_eq!(cfg.progress_interval_ms, 100);
        assert_eq!(cfg.flush_bytes, 1_500_000);
    }

    #[test]
    fn progress_event_serializes_to_expected_shape() {
        let ev = ScanEvent::Progress(ProgressPayload {
            current_block: 5, tip_height: 10, total_blocks: 10,
            blocks_scanned: 5, percent_complete: 50.0, utxos_found: 0,
        });
        let s = scan_event_json(&ev);
        assert!(s.contains(r#""type":"progress""#));
        assert!(s.contains(r#""currentBlock":5"#));
        assert!(s.contains(r#""percentComplete":50.0"#));
    }

    #[test]
    fn done_and_error_serialize() {
        assert_eq!(scan_event_json(&ScanEvent::Done), r#"{"type":"done"}"#);
        let e = ScanEvent::Error { code: "stalled".into(), message: "no frames".into() };
        let s = scan_event_json(&e);
        assert!(s.contains(r#""type":"error""#) && s.contains(r#""code":"stalled""#));
    }
}
```

Add `mod stream_engine;` near the top of `rust_jsi_bridge/src/lib.rs` (after the `use` block).

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `cd rust_jsi_bridge && cargo test stream_engine::tests`
Expected: compiles and the three tests pass (they are written against the code in the same step — if `serde(tag=...)` emits an unexpected shape, fix the derive until the asserts pass).

- [ ] **Step 3: Commit**

```bash
git add rust_jsi_bridge/src/lib.rs rust_jsi_bridge/src/stream_engine/mod.rs
git commit -m "feat(rust): scan engine config + event model with JSON serialization"
```

---

## Task 3: Rust — session core (scan loop over an abstract frame source)

The scan loop is decoupled from the network so it is unit-testable without a socket: it consumes `(height, bytes)` frames from a channel, batches by `flush_bytes`, scans on `spawn_blocking`, and emits events through a callback.

**Files:**
- Create: `rust_jsi_bridge/src/stream_engine/session.rs`
- Modify: `rust_jsi_bridge/src/stream_engine/mod.rs` (`mod session;`, shared `EmitFn` type)

**Interfaces:**
- Consumes: `parse_silent_block_frames`, `process_transactions_parallel`, `MatchedUTXO`, `ScanConfig`, `ScanEvent` (Task 2).
- Produces:
  - `type EmitFn = Arc<dyn Fn(ScanEvent) + Send + Sync>`.
  - `struct SessionControl { cancel: Arc<AtomicBool>, pause: Arc<AtomicBool> }` with `cancel()`, `pause()`, `resume()`.
  - `async fn run_scan_loop(cfg: Arc<ScanConfig>, mut frames: Receiver<(u32, Vec<u8>)>, emit: EmitFn, ctrl: SessionControl)` — drains frames, batches, scans, emits `Progress`/`Match`/`Done`/`Error`. The WS task (Task 4) is the producer on the channel; tests feed it directly.

- [ ] **Step 1: Write the failing test**

In `session.rs`:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::mpsc::Receiver;

use secp256k1::{PublicKey, SecretKey};
use crate::{parse_silent_block_frames, process_transactions_parallel};
use super::{EmitFn, ScanConfig, ScanEvent, ProgressPayload};

#[derive(Clone)]
pub struct SessionControl {
    pub cancel: Arc<AtomicBool>,
    pub pause: Arc<AtomicBool>,
}
impl SessionControl {
    pub fn new() -> Self {
        Self { cancel: Arc::new(AtomicBool::new(false)), pause: Arc::new(AtomicBool::new(false)) }
    }
    pub fn cancel(&self) { self.cancel.store(true, Ordering::SeqCst); }
    pub fn pause(&self) { self.pause.store(true, Ordering::SeqCst); }
    pub fn resume(&self) { self.pause.store(false, Ordering::SeqCst); }
}

fn parse_keys(cfg: &ScanConfig) -> Result<(SecretKey, PublicKey), String> {
    let sk = SecretKey::from_slice(&hex::decode(&cfg.scan_privkey_hex).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let pk = PublicKey::from_slice(&hex::decode(&cfg.spend_pubkey_hex).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok((sk, pk))
}

/// Drain frames, batch by flush_bytes, scan each batch on a blocking thread,
/// and emit progress (throttled), matches, and a terminal done/error.
pub async fn run_scan_loop(
    cfg: Arc<ScanConfig>,
    mut frames: Receiver<(u32, Vec<u8>)>,
    emit: EmitFn,
    ctrl: SessionControl,
) {
    let (sk, pk) = match parse_keys(&cfg) {
        Ok(v) => v,
        Err(e) => { emit(ScanEvent::Error { code: "config".into(), message: e }); return; }
    };
    let total_blocks = cfg.to.saturating_sub(cfg.from).saturating_add(1);
    let mut pending: Vec<u8> = Vec::new();
    let mut pending_max_height = cfg.from.saturating_sub(1);
    let mut blocks_scanned: u32 = 0;
    let mut utxos_found: u32 = 0;
    let mut last_emit = Instant::now()
        .checked_sub(std::time::Duration::from_millis(cfg.progress_interval_ms))
        .unwrap_or_else(Instant::now);

    // scan one batch synchronously on a blocking thread; returns (matches, txs, outs)
    async fn scan_batch(sk: SecretKey, pk: PublicKey, bytes: Vec<u8>)
        -> Result<crate::BatchScanResult, String> {
        tokio::task::spawn_blocking(move || {
            let txs = parse_silent_block_frames(&bytes)?;
            Ok(process_transactions_parallel(&sk, &pk, &txs))
        }).await.map_err(|e| e.to_string())?
    }

    while let Some((height, bytes)) = frames.recv().await {
        if ctrl.cancel.load(Ordering::SeqCst) {
            emit(ScanEvent::Error { code: "cancelled".into(), message: "scan cancelled".into() });
            return;
        }
        while ctrl.pause.load(Ordering::SeqCst) && !ctrl.cancel.load(Ordering::SeqCst) {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        pending.extend_from_slice(&bytes);
        pending_max_height = height;

        // throttled progress driven by frames received
        if last_emit.elapsed().as_millis() as u64 >= cfg.progress_interval_ms {
            last_emit = Instant::now();
            let scanned = pending_max_height.saturating_sub(cfg.from).saturating_add(1);
            emit(ScanEvent::Progress(ProgressPayload {
                current_block: pending_max_height, tip_height: cfg.to, total_blocks,
                blocks_scanned: scanned,
                percent_complete: if total_blocks > 0 { scanned as f64 / total_blocks as f64 * 100.0 } else { 0.0 },
                utxos_found,
            }));
        }

        if pending.len() >= cfg.flush_bytes {
            let batch = std::mem::take(&mut pending);
            match scan_batch(sk, pk, batch).await {
                Ok(res) => {
                    if !res.matched_utxos.is_empty() {
                        utxos_found += res.matched_utxos.len() as u32;
                        emit(ScanEvent::Match { utxos: res.matched_utxos });
                    }
                    blocks_scanned = pending_max_height.saturating_sub(cfg.from).saturating_add(1);
                }
                Err(e) => { emit(ScanEvent::Error { code: "scan".into(), message: e }); return; }
            }
        }
    }

    // channel closed = stream complete: flush remainder
    if !pending.is_empty() && !ctrl.cancel.load(Ordering::SeqCst) {
        let batch = std::mem::take(&mut pending);
        match scan_batch(sk, pk, batch).await {
            Ok(res) => {
                if !res.matched_utxos.is_empty() {
                    utxos_found += res.matched_utxos.len() as u32; // mirror the in-loop flush
                    emit(ScanEvent::Match { utxos: res.matched_utxos });
                }
            }
            Err(e) => { emit(ScanEvent::Error { code: "scan".into(), message: e }); return; }
        }
    }
    if !ctrl.cancel.load(Ordering::SeqCst) {
        // final 100% progress + done
        emit(ScanEvent::Progress(ProgressPayload {
            current_block: cfg.to, tip_height: cfg.to, total_blocks,
            blocks_scanned: total_blocks, percent_complete: 100.0, utxos_found,
        }));
        emit(ScanEvent::Done);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    fn test_cfg(flush_bytes: usize) -> ScanConfig {
        serde_json::from_str(&format!(
            r#"{{"wsUrl":"ws://x/","from":1,"to":3,"scanPrivkeyHex":"{}","spendPubkeyHex":"{}","flushBytes":{},"progressIntervalMs":0}}"#,
            "11".repeat(32),       // 32-byte privkey hex (valid scalar, non-zero)
            "02".to_string() + &"11".repeat(32), // 33-byte compressed pubkey hex placeholder
            flush_bytes
        )).unwrap()
    }

    // Minimal valid empty silent-block frame: height(4 BE) | len(4 BE)=1 | 1 byte tx-count=0.
    fn empty_frame(height: u32) -> (u32, Vec<u8>) {
        let mut block = vec![0u8]; // varint tx count = 0
        let mut buf = Vec::new();
        buf.extend_from_slice(&height.to_be_bytes());
        buf.extend_from_slice(&(block.len() as u32).to_be_bytes());
        buf.append(&mut block);
        (height, buf)
    }

    #[tokio::test]
    async fn emits_progress_and_done_for_empty_stream() {
        let cfg = Arc::new(test_cfg(1));
        let events = Arc::new(Mutex::new(Vec::<ScanEvent>::new()));
        let ev2 = events.clone();
        let emit: EmitFn = Arc::new(move |e| ev2.lock().unwrap().push(e));
        let (tx, rx) = mpsc::channel(8);
        for h in 1..=3 { tx.send(empty_frame(h)).await.unwrap(); }
        drop(tx);
        run_scan_loop(cfg, rx, emit, SessionControl::new()).await;

        let evs = events.lock().unwrap();
        assert!(matches!(evs.last().unwrap(), ScanEvent::Done));
        assert!(evs.iter().any(|e| matches!(e, ScanEvent::Progress(_))));
    }

    #[tokio::test]
    async fn cancel_stops_before_done() {
        let cfg = Arc::new(test_cfg(1_000_000));
        let events = Arc::new(Mutex::new(Vec::<ScanEvent>::new()));
        let ev2 = events.clone();
        let emit: EmitFn = Arc::new(move |e| ev2.lock().unwrap().push(e));
        let ctrl = SessionControl::new();
        ctrl.cancel();
        let (tx, rx) = mpsc::channel(8);
        tx.send(empty_frame(1)).await.unwrap();
        drop(tx);
        run_scan_loop(cfg, rx, emit, ctrl).await;

        let evs = events.lock().unwrap();
        assert!(!evs.iter().any(|e| matches!(e, ScanEvent::Done)));
        assert!(evs.iter().any(|e| matches!(e, ScanEvent::Error { code, .. } if code == "cancelled")));
    }
}
```

In `mod.rs` add `pub mod session;` and `pub type EmitFn = std::sync::Arc<dyn Fn(ScanEvent) + Send + Sync>;`.

- [ ] **Step 2: Run the tests**

Run: `cd rust_jsi_bridge && cargo test stream_engine::session`
Expected: both async tests pass. (If the placeholder pubkey hex is rejected by `PublicKey::from_slice`, replace it in `test_cfg` with a real compressed pubkey — generate one with `secp256k1` in the test setup; the scan result for empty frames is unaffected.)

- [ ] **Step 3: Commit**

```bash
git add rust_jsi_bridge/src/stream_engine/mod.rs rust_jsi_bridge/src/stream_engine/session.rs
git commit -m "feat(rust): session scan loop over abstract frame source (channel-fed, testable)"
```

---

## Task 4: Rust — WS transport + FFI exports

Wire a real `wss://` socket to the session core and expose the C ABI. Remove the Task 1 `__ws_link_check` shim.

**Files:**
- Create: `rust_jsi_bridge/src/stream_engine/ws.rs`
- Modify: `rust_jsi_bridge/src/stream_engine/mod.rs` (FFI exports + session manager)
- Modify: `rust_jsi_bridge/src/lib.rs` (delete `__ws_link_check`)

**Interfaces:**
- Consumes: `run_scan_loop`, `SessionControl`, `ScanConfig`, `scan_event_json` (Tasks 2–3); the resolved `tokio-tungstenite` connector from the Task 1 spike.
- Produces (C ABI):
  - `type EmitCallback = extern "C" fn(ctx: *mut c_void, json_ptr: *const u8, json_len: usize)`.
  - `extern "C" fn sp_scan_start(config_json: *const c_char, emit_cb: EmitCallback, ctx: *mut c_void) -> *const c_char` — returns `"ok"` or an error string (already-running, bad config). Spawns the engine thread.
  - `extern "C" fn sp_scan_pause()`, `sp_scan_resume()`, `sp_scan_cancel()`.
  - A global `static SESSION: Mutex<Option<SessionHandle>>` where `SessionHandle { ctrl: SessionControl, thread: JoinHandle<()> }`.

- [ ] **Step 1: Implement the WS transport (`ws.rs`)**

```rust
use std::sync::Arc;
use std::time::Duration;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc::Sender;
use tokio::time::{timeout, interval};
use tokio_tungstenite::tungstenite::Message;

use super::{ScanConfig, ScanEvent, EmitFn};

/// Connect, send the sync request, stream binary frames into `tx`, and keep the
/// connection alive with WS pings. On unsupported/stall/socket failure, emit the
/// matching error and return (closing `tx` so the scan loop can finalize/abort).
pub async fn run_ws(cfg: Arc<ScanConfig>, tx: Sender<(u32, Vec<u8>)>, emit: EmitFn) {
    // tokio-tungstenite picks rustls(ring)+webpki-roots via the crate features set
    // in Task 1; connect_async handles ws:// and wss:// by scheme.
    let connect = tokio_tungstenite::connect_async(&cfg.ws_url);
    let (ws, _resp) = match timeout(Duration::from_millis(cfg.first_frame_timeout_ms), connect).await {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => { emit(ScanEvent::Error { code: "unsupported".into(), message: format!("connect: {e}") }); return; }
        Err(_) => { emit(ScanEvent::Error { code: "unsupported".into(), message: "connect timeout".into() }); return; }
    };
    let (mut write, mut read) = ws.split();

    let sync = serde_json::json!({"event":"sync","data":{"from":cfg.from,"to":cfg.to,"filterSpent":cfg.filter_spent}});
    if let Err(e) = write.send(Message::Text(sync.to_string())).await {
        emit(ScanEvent::Error { code: "socket".into(), message: format!("sync send: {e}") }); return;
    }

    let mut received_any = false;
    let mut last_height = cfg.from.saturating_sub(1);
    let mut hb = interval(Duration::from_millis(cfg.heartbeat_interval_ms));
    hb.tick().await; // consume immediate first tick

    loop {
        tokio::select! {
            _ = hb.tick() => { let _ = write.send(Message::Ping(Vec::new())).await; }
            msg = timeout(Duration::from_millis(cfg.idle_timeout_ms), read.next()) => {
                let msg = match msg {
                    Err(_) => { emit(ScanEvent::Error { code: "stalled".into(), message: "idle timeout".into() }); return; }
                    Ok(None) => { // socket closed
                        if !received_any { emit(ScanEvent::Error { code: "unsupported".into(), message: "closed before data".into() }); }
                        return; // tx drops → scan loop finalizes
                    }
                    Ok(Some(Ok(m))) => m,
                    Ok(Some(Err(e))) => {
                        emit(ScanEvent::Error { code: if received_any {"socket"} else {"unsupported"}.into(), message: e.to_string() });
                        return;
                    }
                };
                match msg {
                    Message::Binary(buf) if buf.len() >= 8 => {
                        received_any = true;
                        let height = u32::from_be_bytes([buf[0],buf[1],buf[2],buf[3]]);
                        if height <= last_height { continue; } // dedupe/order guard
                        last_height = height;
                        if tx.send((height, buf)).await.is_err() { return; } // scan loop gone
                    }
                    Message::Text(t) => {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                            match v.get("event").and_then(|e| e.as_str()) {
                                Some("synced") => return, // tx drops → loop flushes + done
                                Some("error") => {
                                    let m = v.pointer("/data/message").and_then(|x| x.as_str()).unwrap_or("unknown");
                                    emit(ScanEvent::Error { code: "socket".into(), message: m.into() }); return;
                                }
                                _ => {}
                            }
                        }
                    }
                    Message::Close(_) => { if !received_any { emit(ScanEvent::Error { code: "unsupported".into(), message: "closed".into() }); } return; }
                    _ => {}
                }
            }
        }
    }
}
```

> The exact `connect_async` return type / `Message::Ping` payload type may differ slightly across the resolved `tokio-tungstenite` version — reconcile against the version pinned in Task 1; the control flow above is the contract.

- [ ] **Step 2: Implement FFI + session manager in `mod.rs`**

```rust
pub mod session;
pub mod ws;

use std::ffi::{c_void, CStr, CString};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use zeroize::Zeroize;
use session::{run_scan_loop, SessionControl};

struct SessionHandle { ctrl: SessionControl, thread: JoinHandle<()> }
fn session_slot() -> &'static Mutex<Option<SessionHandle>> {
    static S: OnceLock<Mutex<Option<SessionHandle>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

pub type EmitCallback = extern "C" fn(ctx: *mut c_void, json_ptr: *const u8, json_len: usize);

/// Wrap the C callback in a Send+Sync Rust closure. `ctx` is an opaque pointer the
/// C++ side owns for the session's lifetime (it holds the retained JS onEvent).
struct CtxPtr(*mut c_void);
unsafe impl Send for CtxPtr {}
unsafe impl Sync for CtxPtr {}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_start(config_json: *const c_char, emit_cb: EmitCallback, ctx: *mut c_void) -> *const c_char {
    let ret = |s: &str| CString::new(s).unwrap().into_raw() as *const c_char;
    {
        let guard = session_slot().lock().unwrap();
        if guard.is_some() { return ret("error: scan already running"); }
    }
    let mut cfg_str = match unsafe { CStr::from_ptr(config_json) }.to_str() {
        Ok(s) => s.to_owned(), Err(_) => return ret("error: bad config utf8"),
    };
    let cfg: ScanConfig = match serde_json::from_str(&cfg_str) {
        Ok(c) => c,
        Err(e) => { cfg_str.zeroize(); return ret(&format!("error: config: {e}")); }
    };
    cfg_str.zeroize(); // plaintext key no longer needed in the raw JSON string

    let ctx_holder = CtxPtr(ctx);
    let emit: session::EmitFn = Arc::new(move |ev: ScanEvent| {
        let json = scan_event_json(&ev);
        let bytes = json.as_bytes();
        emit_cb(ctx_holder.0, bytes.as_ptr(), bytes.len());
    });

    let ctrl = SessionControl::new();
    let ctrl_for_thread = ctrl.clone();
    let cfg_arc = Arc::new(cfg); // ScanConfig zeroizes scan_privkey_hex on drop (see note)
    let thread = std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async move {
            let (tx, rx) = tokio::sync::mpsc::channel::<(u32, Vec<u8>)>(8);
            let ws_emit = emit.clone();
            let ws_cfg = cfg_arc.clone();
            let ws_task = tokio::spawn(async move { ws::run_ws(ws_cfg, tx, ws_emit).await; });
            run_scan_loop(cfg_arc.clone(), rx, emit, ctrl_for_thread).await;
            // abort run_ws so cancel doesn't block up to idle_timeout_ms waiting on a
            // frame; no-op when run_ws already returned on `synced`.
            ws_task.abort();
            let _ = ws_task.await;
        });
        // session end: cfg_arc drops here, zeroizing the held key.
    });

    *session_slot().lock().unwrap() = Some(SessionHandle { ctrl, thread });
    ret("ok")
}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_pause() { if let Some(h) = session_slot().lock().unwrap().as_ref() { h.ctrl.pause(); } }
#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_resume() { if let Some(h) = session_slot().lock().unwrap().as_ref() { h.ctrl.resume(); } }
#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_cancel() {
    let handle = session_slot().lock().unwrap().take();
    if let Some(h) = handle { h.ctrl.cancel(); let _ = h.thread.join(); }
}
```

> Implementation notes for the engineer: (1) `std::mem::take_or_clone` is shorthand — actually move `cfg` into `Arc::new(cfg)` and derive the privkey inside `run_scan_loop` (Task 3 already parses keys from the config), then zeroize the `scan_privkey_hex` field before the `String` config copy is dropped. Keep the key in memory no longer than the session. (2) On `Done`/`Error`, clear the global slot from within the thread's final block so a subsequent `sp_scan_start` succeeds — guard against the `sp_scan_cancel` path having already taken it. (3) `ScanConfig` should `impl Drop`/`Zeroize` for `scan_privkey_hex`, or zeroize explicitly. Reconcile these into clean code; the contract is: single session, key zeroized, slot cleared on terminal state.

- [ ] **Step 3: Delete the Task 1 shim and build + test (host)**

Remove `__ws_link_check` from `lib.rs`. Run: `cd rust_jsi_bridge && cargo test`
Expected: all engine + existing tests pass.

- [ ] **Step 4: Integration test against a local mock WS server**

Add `rust_jsi_bridge/tests/ws_engine.rs` that starts a tokio TCP/WS server which: accepts the connection, expects the `sync` JSON, sends two binary empty frames (heights `from`, `from+1`), then a `{"event":"synced"}` text frame. Drive `run_ws` + `run_scan_loop` wired together; assert the event sequence ends in `Done` and progress reached 100%. (Use `tokio-tungstenite`'s `accept_async` server side.)

Run: `cargo test --test ws_engine`
Expected: PASS.

- [ ] **Step 5: Cross-compile the four Android ABIs again**

Run: `cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 build --release`
Expected: all four link. Copy artifacts into `android/app/src/main/jniLibs/<abi>/librust_jsi_bridge.a` (or run the repo's `rust-native-setup.sh` Android path) so the gradle build in Task 5 picks them up.

- [ ] **Step 6: Commit**

```bash
git add rust_jsi_bridge/src/stream_engine/ rust_jsi_bridge/src/lib.rs rust_jsi_bridge/tests/ws_engine.rs android/app/src/main/jniLibs
git commit -m "feat(rust): WS transport + sp_scan_start/pause/resume/cancel FFI with single-session manager"
```

---

## Task 5: Native C++ host functions (Android build-verified; iOS deferred)

**Files:**
- Modify: `android/app/src/main/cpp/RustJsiBridge.cpp`
- Modify: `ios/RustJsiBridge/RustJsiBridge.cpp` `[DEFERRED — macOS]`

**Interfaces:**
- Consumes: the Phase 1 `std::shared_ptr<CallInvoker> callInvoker` already captured in `installJSIBindings`; the Task 4 FFI (`sp_scan_start/pause/resume/cancel`).
- Produces JSI globals: `spScanStart(configJson: string, onEvent: (eventJson: string) => void)`, `spScanPause()`, `spScanResume()`, `spScanCancel()`.

- [ ] **Step 1: Declare the new FFI in the Android `RustJsiBridge.cpp` extern block**

```cpp
extern "C" {
    // ... existing declarations ...
    typedef void (*EmitCallback)(void* ctx, const uint8_t* json_ptr, size_t json_len);
    const char* sp_scan_start(const char* config_json, EmitCallback emit_cb, void* ctx);
    void sp_scan_pause();
    void sp_scan_resume();
    void sp_scan_cancel();
}
```

- [ ] **Step 2: Add the host functions inside `installJSIBindings` (Android copy)**

The `onEvent` JS function is retained in a heap `EventCtx` whose pointer is the FFI `ctx`. The C `emit_cb` is a non-capturing function that hops to the JS thread via the captured `CallInvoker` and invokes `onEvent`.

```cpp
// EventCtx is shared-owned (enable_shared_from_this) so a still-queued event
// lambda keeps it alive even if gEventCtx is reset (cancel/restart) before the
// lambda runs — capturing a raw EventCtx* would use-after-free in that window.
struct EventCtx : std::enable_shared_from_this<EventCtx> {
    std::shared_ptr<facebook::react::CallInvoker> callInvoker;
    std::shared_ptr<Function> onEvent;
    Runtime* rt;
    EventCtx(std::shared_ptr<facebook::react::CallInvoker> ci, std::shared_ptr<Function> oe, Runtime* r)
        : callInvoker(std::move(ci)), onEvent(std::move(oe)), rt(r) {}
};

static void sp_emit_trampoline(void* ctx, const uint8_t* json_ptr, size_t json_len) {
    auto ec = static_cast<EventCtx*>(ctx)->shared_from_this(); // bump refcount for the queued lambda
    auto json = std::make_shared<std::string>(reinterpret_cast<const char*>(json_ptr), json_len);
    ec->callInvoker->invokeAsync([ec, json]() {
        Runtime& rt = *ec->rt;
        ec->onEvent->call(rt, String::createFromUtf8(rt, *json));
    });
}

// ponytail: single-session static — one active scan at a time per process.
static std::shared_ptr<EventCtx> gEventCtx;

auto spScanStart = Function::createFromHostFunction(
    jsiRuntime, PropNameID::forAscii(jsiRuntime, "spScanStart"), 2,
    [callInvoker](Runtime& runtime, const Value&, const Value* args, size_t count) -> Value {
        if (count < 2) throw JSError(runtime, "spScanStart() expects (configJson, onEvent)");
        std::string configJson = args[0].asString(runtime).utf8(runtime);
        auto onEvent = std::make_shared<Function>(args[1].asObject(runtime).asFunction(runtime));
        // Reset-then-check: free the previous session's EventCtx (safe — Rust emits
        // nothing after terminal/cancel; queued lambdas hold their own shared_ptr).
        gEventCtx = std::make_shared<EventCtx>(callInvoker, onEvent, &runtime);
        const char* res = sp_scan_start(configJson.c_str(), &sp_emit_trampoline, gEventCtx.get());
        std::string r(res); free_rust_string(const_cast<char*>(res));
        if (r.rfind("error", 0) == 0) { gEventCtx.reset(); throw JSError(runtime, r.c_str()); }
        return Value::undefined();
    });
jsiRuntime.global().setProperty(jsiRuntime, "spScanStart", std::move(spScanStart));

for (const char* name : {"spScanPause","spScanResume","spScanCancel"}) {
    auto fn = Function::createFromHostFunction(
        jsiRuntime, PropNameID::forAscii(jsiRuntime, name), 0,
        [name](Runtime&, const Value&, const Value*, size_t) -> Value {
            std::string n(name);
            if (n == "spScanPause") sp_scan_pause();
            else if (n == "spScanResume") sp_scan_resume();
            else sp_scan_cancel();
            return Value::undefined();
        });
    jsiRuntime.global().setProperty(jsiRuntime, name, std::move(fn));
}
```

> `EventCtx` lifetime: it must outlive every queued `emit` callback. `sp_scan_cancel` joins the Rust worker, but a terminal event the worker emitted just before the join may still be **queued on the JS thread**; if `gEventCtx.reset()` then freed a raw-pointer-captured EventCtx, that queued lambda would use-after-free. The fix (above): `EventCtx` is `enable_shared_from_this`, owned by `gEventCtx` (a `shared_ptr`), and `sp_emit_trampoline` captures `shared_from_this()` so each queued lambda holds its own reference. `gEventCtx.reset()`/reassign on cancel/restart then only drops the global's reference; the object dies when the last queued lambda finishes. The same `spScanCancel` handler still calls `sp_scan_cancel()` then `gEventCtx.reset()`. Never free `EventCtx` inside the trampoline before `invokeAsync` runs.

- [ ] **Step 3: Build-verify on Android**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: `BUILD SUCCESSFUL` (Java + CMake native link of the new FFI symbols across all ABIs).

- [ ] **Step 4: iOS `[DEFERRED — macOS]`**

Apply the identical host-function block to `ios/RustJsiBridge/RustJsiBridge.cpp` and build on a Mac (`cd ios && pod install && cd .. && npx react-native run-ios`). Not performed on this host.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/cpp/RustJsiBridge.cpp
git commit -m "feat(android): spScanStart/Pause/Resume/Cancel host functions bridging engine events"
```

---

## Task 6: JS — wrappers, event-bridge, and the (default-off) flag

Phase 2 stops at making the engine reachable behind a flag and unit-testing the bridge. **It does not wire into `performScan`** — that is Phase 3.

**Files:**
- Modify: `modules/RustJsiBridge.ts`
- Modify: `modules/SilentBlockStreamClient.ts`
- Modify: `modules/constants.ts`
- Test: `tests/unit/rustStreamEngineBridge.test.ts` (create)

**Interfaces:**
- Consumes: the JSI globals from Task 5; the existing `ScanProgressCallback`, `ScanRangeHandlers` types.
- Produces:
  - `modules/RustJsiBridge.ts`: `spScanStart(configJson, onEvent)`, `spScanPause()`, `spScanResume()`, `spScanCancel()` typed wrappers; a `RustScanEvent` discriminated-union type.
  - `modules/SilentBlockStreamClient.ts`: `streamViaRustEngine(params): Promise<void>` mapping engine events onto the existing `onProgress` / `handlers.onMatch` contract, rejecting with `StreamUnsupportedError` on `error.code==="unsupported"`.
  - `modules/constants.ts`: `export const useRustOwnedStream = false;`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rustStreamEngineBridge.test.ts`:

```typescript
// Drives streamViaRustEngine with mocked native globals: feeds engine events and
// asserts they map to onProgress/onMatch and that done resolves / unsupported rejects.
import { streamViaRustEngine } from '../../modules/SilentBlockStreamClient';
import { StreamUnsupportedError } from '../../modules/SilentBlockStreamClient';

function withMockEngine(script: (onEvent: (j: string) => void) => void) {
  (global as any).spScanStart = (_cfg: string, onEvent: (j: string) => void) => {
    setImmediate(() => script(onEvent));
  };
  (global as any).spScanCancel = () => {};
  (global as any).spScanPause = () => {};
  (global as any).spScanResume = () => {};
}

afterEach(() => {
  ['spScanStart','spScanCancel','spScanPause','spScanResume'].forEach(k => { delete (global as any)[k]; });
});

it('maps progress events and resolves on done', async () => {
  const progress: number[] = [];
  withMockEngine(onEvent => {
    onEvent(JSON.stringify({ type: 'progress', currentBlock: 5, tipHeight: 10, totalBlocks: 10, blocksScanned: 5, percentComplete: 50, utxosFound: 0 }));
    onEvent(JSON.stringify({ type: 'done' }));
  });
  await streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async () => {} },
    onProgress: p => { progress.push(p.percentComplete); },
  });
  expect(progress).toContain(50);
});

it('rejects with StreamUnsupportedError on unsupported', async () => {
  withMockEngine(onEvent => onEvent(JSON.stringify({ type: 'error', code: 'unsupported', message: 'no sync' })));
  await expect(streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async () => {} },
  })).rejects.toBeInstanceOf(StreamUnsupportedError);
});

it('forwards match events to onMatch', async () => {
  const matches: any[] = [];
  withMockEngine(onEvent => {
    onEvent(JSON.stringify({ type: 'match', utxos: [{ txid: 'a', vout: 0, value: 1, height: 2, pubKey: 'p', tweakHex: 't' }] }));
    onEvent(JSON.stringify({ type: 'done' }));
  });
  await streamViaRustEngine({
    wsUrl: 'wss://x/', from: 1, to: 10, scanPrivkeyHex: 'aa', spendPubkeyHex: 'bb',
    handlers: { onMatch: async (u: any[]) => { matches.push(...u); } },
  });
  expect(matches).toHaveLength(1);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/rustStreamEngineBridge.test.ts`
Expected: FAIL — `streamViaRustEngine` not exported.

- [ ] **Step 3: Implement the wrappers, bridge, and flag**

In `modules/constants.ts` add:
```typescript
// Phase 2: when true, the silent-block stream is owned by the Rust engine.
// Default false until the engine is validated on-device (Phase 3 flips it).
export const useRustOwnedStream = false;
```

In `modules/RustJsiBridge.ts` add typed wrappers (guarded by `isInstalled`) for `spScanStart(configJson, onEvent)`, `spScanPause/Resume/Cancel`, and:
```typescript
export type RustScanEvent =
  | { type: 'progress'; currentBlock: number; tipHeight: number; totalBlocks: number; blocksScanned: number; percentComplete: number; utxosFound: number }
  | { type: 'match'; utxos: Array<{ txid: string; vout: number; value: number; height: number; pubKey: string; tweakHex: string }> }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };
```

In `modules/SilentBlockStreamClient.ts` add `streamViaRustEngine(params)` that builds `configJson`, calls `spScanStart`, and in `onEvent` parses the JSON and routes: `progress → onProgress`; `match → handlers.onMatch(utxos)`; `done → resolve`; `error → reject(code==='unsupported' ? new StreamUnsupportedError(message) : new Error(message))`. Wire `cancelCallback` to `spScanCancel()`. Extend `ScanRangeHandlers` (or a local handler type) with `onMatch(utxos): Promise<void>`. **Do not modify the existing `streamSilentBlocks` or any caller** — `streamViaRustEngine` is additive and unreferenced by production code until Phase 3.

- [ ] **Step 4: Run the test + full unit suite**

Run: `npx jest tests/unit/rustStreamEngineBridge.test.ts && npx jest tests/unit`
Expected: new tests pass; nothing else regresses (the flag is off; no production path changed).

- [ ] **Step 5: Commit**

```bash
git add modules/RustJsiBridge.ts modules/SilentBlockStreamClient.ts modules/constants.ts tests/unit/rustStreamEngineBridge.test.ts
git commit -m "feat(scan): JS wrappers + event-bridge for Rust stream engine behind default-off flag"
```

---

## Phase 2 self-review

- **Deps + cross-compile proven:** Task 1 (Android-verifiable here). ✓
- **Config + events:** Task 2. ✓
- **Session scan loop (reuses existing scanner):** Task 3, tests with in-memory frames. ✓
- **WS transport + FFI + single-session manager + key zeroize:** Task 4. ✓
- **Native host functions bridging events via CallInvoker:** Task 5 (Android verified; iOS deferred). ✓
- **JS wrappers + bridge + default-off flag, no production path changed:** Task 6. ✓
- **No scan-crypto changes; binary metadata resolution stays in JS:** honored across Tasks 3–6. ✓
- **Type consistency:** `RustScanEvent` (TS) mirrors `ScanEvent` (Rust) field-for-field; `onMatch(utxos)` consumes the `MatchedUTXO` camelCase shape; FFI names `sp_scan_start/pause/resume/cancel` match between Rust exports (Task 4), the C++ extern block (Task 5), and the JSI global names `spScanStart/Pause/Resume/Cancel` the JS wrappers look up (Task 6). ✓

## Carried risks / deferred to Phase 3

- iOS host functions (Task 5 Step 4) — implement + build on macOS.
- On-device validation (both platforms incl. `armeabi-v7a`): first real `wss://`-through-tunnel handshake, UI responsiveness, progress smoothness, pause/resume/cancel, match correctness.
- `EventCtx` / session-slot lifecycle (free on terminal event vs. cancel) — the trickiest correctness point; exercise it under a flag-on dev build before Phase 3 wires `performScan`.
- Phase 3: re-target `performScan` to `streamViaRustEngine` when `useRustOwnedStream` is on; progress→`lastScannedBlock` + throttled persist; `onMatch`→`resolveMatchMetadata`+`commitUTXOs`; `error{unsupported|socket}`→existing HTTP fallback; then flip the flag and delete the legacy JS loop (Phase 4).
