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
                    emit(ScanEvent::Match { utxos: res.matched_utxos });
                }
            }
            Err(e) => { emit(ScanEvent::Error { code: "scan".into(), message: e }); return; }
        }
        let _ = blocks_scanned;
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
        // ponytail: derive real pubkey from privkey so PublicKey::from_slice accepts it
        let sk = SecretKey::from_slice(&[0x11u8; 32]).unwrap();
        let pk = PublicKey::from_secret_key(&secp256k1::Secp256k1::new(), &sk);
        let pk_hex = hex::encode(pk.serialize());
        serde_json::from_str(&format!(
            r#"{{"wsUrl":"ws://x/","from":1,"to":3,"scanPrivkeyHex":"{}","spendPubkeyHex":"{}","flushBytes":{},"progressIntervalMs":0}}"#,
            "11".repeat(32),
            pk_hex,
            flush_bytes
        )).unwrap()
    }

    // Minimal valid empty silent-block frame: height(4 BE) | len(4 BE) | block_type(1) + varint_tx_count(1)=0.
    fn empty_frame(height: u32) -> (u32, Vec<u8>) {
        let mut block = vec![0x00u8, 0x00u8]; // block_type=0x00 + varint tx count=0
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
