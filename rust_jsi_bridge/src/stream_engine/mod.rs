use std::sync::Arc;
use serde::{Deserialize, Serialize};
use crate::MatchedUTXO;

pub mod session;

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
