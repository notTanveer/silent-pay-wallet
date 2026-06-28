use std::ffi::{c_void, CStr, CString};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::JoinHandle;
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;
use crate::MatchedUTXO;

pub mod session;
pub mod ws;

pub type EmitFn = Arc<dyn Fn(ScanEvent) + Send + Sync>;

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

/// Zeroize the private key on drop so it does not linger in freed heap memory.
/// Only the key field is sensitive; other fields are plain config.
impl Drop for ScanConfig {
    fn drop(&mut self) {
        self.scan_privkey_hex.zeroize();
    }
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

// ============================================================================
// FFI — streaming scan engine
// ============================================================================

/// The C callback the JS side passes into sp_scan_start. Called on the engine
/// thread; the C++ side must ensure `ctx` is valid for the session's lifetime.
pub type EmitCallback = extern "C" fn(ctx: *mut c_void, json_ptr: *const u8, json_len: usize);

// ponytail: store ctx as usize rather than a CtxPtr newtype — usize is Send+Sync
// natively; the Rust 2024 closure capture rules decompose struct fields, so a
// newtype wrapper would still expose the inner *mut c_void to the capture analysis.

struct SessionHandle {
    ctrl: session::SessionControl,
    thread: JoinHandle<()>,
}

fn session_slot() -> &'static Mutex<Option<SessionHandle>> {
    static S: OnceLock<Mutex<Option<SessionHandle>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// Start a streaming scan session.
///
/// Returns `"ok"` on success, or a string starting with `"error"` on failure
/// (already running, bad config). The returned pointer must be freed by the
/// caller with `free_rust_string`.
///
/// Session-slot ordering (prevents deadlock):
///   - sp_scan_cancel: lock → take handle → release lock → signal cancel → join thread.
///   - Thread completion: after run_scan_loop+ws_task finish, lock → set None (drops
///     JoinHandle, which safely detaches this thread) → release lock → thread exits.
///   - If cancel takes first: thread finds None, skips clear; cancel's join() returns.
///   - If thread clears first: cancel's take() returns None, join is skipped; thread exits.
///   - Neither holds the lock while waiting for the other. No deadlock.
#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_start(
    config_json: *const c_char,
    emit_cb: EmitCallback,
    ctx: *mut c_void,
) -> *const c_char {
    let ret = |s: &str| {
        CString::new(s)
            .unwrap_or_else(|_| CString::new("error: internal").unwrap())
            .into_raw() as *const c_char
    };

    // Parse and zeroize the raw JSON string (contains the plaintext key) before
    // doing anything else, so it leaves memory as soon as possible.
    let mut cfg_str = match unsafe { CStr::from_ptr(config_json) }.to_str() {
        Ok(s) => s.to_owned(),
        Err(_) => return ret("error: bad config utf8"),
    };
    let cfg: ScanConfig = match serde_json::from_str(&cfg_str) {
        Ok(c) => c,
        Err(e) => {
            cfg_str.zeroize();
            return ret(&format!("error: config: {e}"));
        }
    };
    cfg_str.zeroize(); // key no longer needed as raw JSON

    // Lock, check, spawn, and install atomically so two concurrent callers cannot
    // both pass the is_some() guard (JSI is single-threaded in practice, but this
    // is cheap and correct for any caller).
    let mut guard = session_slot().lock().unwrap();
    if guard.is_some() {
        return ret("error: scan already running");
    }

    // Cast ctx to usize so the closure captures a Send+Sync value. The C++
    // caller guarantees ctx is valid for the session lifetime.
    let ctx_addr = ctx as usize;
    let emit: EmitFn = Arc::new(move |ev: ScanEvent| {
        let json = scan_event_json(&ev);
        let bytes = json.as_bytes();
        emit_cb(ctx_addr as *mut c_void, bytes.as_ptr(), bytes.len());
    });

    let ctrl = session::SessionControl::new();
    let ctrl_for_thread = ctrl.clone();
    let cfg_arc = Arc::new(cfg); // ScanConfig::drop zeroizes scan_privkey_hex

    let thread = std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async move {
            let (tx, rx) = tokio::sync::mpsc::channel::<(u32, Vec<u8>)>(8);
            let ws_emit = emit.clone();
            let ws_cfg = cfg_arc.clone();
            let ws_task = tokio::spawn(async move { ws::run_ws(ws_cfg, tx, ws_emit).await });
            session::run_scan_loop(cfg_arc, rx, emit, ctrl_for_thread).await;
            let _ = ws_task.await;
            // cfg_arc drops here, zeroizing scan_privkey_hex via ScanConfig::drop.
        });

        // Session ended: clear slot so a subsequent sp_scan_start succeeds.
        // Ordering note (see fn-level doc): if sp_scan_cancel already took the slot,
        // the guard is already None and we skip. Dropping JoinHandle from inside the
        // thread detaches without joining (safe — Rust guarantees this is not a
        // deadlock). sp_scan_cancel releases the mutex BEFORE calling join(), so the
        // thread can always acquire it here without racing.
        *session_slot().lock().unwrap() = None;
    });

    *guard = Some(SessionHandle { ctrl, thread });
    ret("ok")
}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_pause() {
    if let Some(h) = session_slot().lock().unwrap().as_ref() {
        h.ctrl.pause();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_resume() {
    if let Some(h) = session_slot().lock().unwrap().as_ref() {
        h.ctrl.resume();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sp_scan_cancel() {
    // Take the handle BEFORE releasing the lock so the thread's self-clear cannot
    // race past us. Then release the lock before join() so the thread can always
    // acquire it in its self-clear path (see ordering note in sp_scan_start).
    let handle = session_slot().lock().unwrap().take();
    if let Some(h) = handle {
        h.ctrl.cancel();
        let _ = h.thread.join();
    }
}

// ============================================================================
// Tests
// ============================================================================

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
