/// Integration test: drives run_ws + run_scan_loop against a local mock WS server.
///
/// The mock server accepts the connection, consumes the sync JSON, sends two
/// empty binary silent-block frames (heights 1000 and 1001), then a
/// `{"event":"synced"}` text frame. The test asserts the event sequence ends
/// with Done and that the last progress event reached 100 %.
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::Message;

use rust_jsi_bridge::stream_engine::{
    scan_event_json, session::{run_scan_loop, SessionControl}, ws::run_ws,
    EmitFn, ScanConfig, ScanEvent,
};

/// Build the binary frame the indexer WS server emits for one block:
///   height(4 BE) | byte_length(4 BE) | silent_block_bytes
/// An empty silent block is: block_type=0x00 | varint_tx_count=0x00 (2 bytes).
fn empty_frame(height: u32) -> Vec<u8> {
    let block = [0x00u8, 0x00u8]; // block_type=SILENT_PAYMENT(0) + 0 txs
    let mut frame = Vec::with_capacity(8 + block.len());
    frame.extend_from_slice(&height.to_be_bytes());
    frame.extend_from_slice(&(block.len() as u32).to_be_bytes());
    frame.extend_from_slice(&block);
    frame
}

#[tokio::test]
async fn mock_server_drives_engine_to_done() {
    // Derive a valid compressed spend public key from a test private key.
    let sk = secp256k1::SecretKey::from_slice(&[0x11u8; 32]).unwrap();
    let pk = secp256k1::PublicKey::from_secret_key(&secp256k1::Secp256k1::new(), &sk);

    // Bind first so the port is known before the client connects.
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let ws_url = format!("ws://127.0.0.1:{port}");

    // Mock WS server: read sync, send 2 empty frames + synced.
    tokio::spawn(async move {
        let (tcp, _) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
        let _ = ws.next().await; // consume the sync JSON
        ws.send(Message::Binary(empty_frame(1000))).await.unwrap();
        ws.send(Message::Binary(empty_frame(1001))).await.unwrap();
        ws.send(Message::Text(r#"{"event":"synced"}"#.to_owned())).await.unwrap();
        // Keep the server alive until the client closes (ws drops here = server close frame sent).
    });

    let cfg: ScanConfig = serde_json::from_str(&format!(
        r#"{{"wsUrl":"{ws_url}","from":1000,"to":1001,"scanPrivkeyHex":"{}","spendPubkeyHex":"{}","progressIntervalMs":0}}"#,
        "11".repeat(32),
        hex::encode(pk.serialize()),
    ))
    .unwrap();
    let cfg = Arc::new(cfg);

    let events: Arc<Mutex<Vec<ScanEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let ev2 = events.clone();
    let emit: EmitFn = Arc::new(move |e| {
        // ponytail: also exercise scan_event_json to catch serialization panics early
        let _ = scan_event_json(&e);
        ev2.lock().unwrap().push(e);
    });

    let (tx, rx) = tokio::sync::mpsc::channel::<(u32, Vec<u8>)>(8);
    let ws_emit = emit.clone();
    let ws_cfg = cfg.clone();
    tokio::spawn(async move { run_ws(ws_cfg, tx, ws_emit).await });
    run_scan_loop(cfg, rx, emit, SessionControl::new()).await;

    let evs = events.lock().unwrap();
    assert!(
        matches!(evs.last().unwrap(), ScanEvent::Done),
        "last event should be Done; got: {:?}",
        evs.iter().map(|e| scan_event_json(e)).collect::<Vec<_>>()
    );
    let last_pct = evs.iter().rev().find_map(|e| match e {
        ScanEvent::Progress(p) => Some(p.percent_complete),
        _ => None,
    });
    assert_eq!(last_pct, Some(100.0), "last progress should be 100 %");
}
