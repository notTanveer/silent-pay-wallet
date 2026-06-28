use std::sync::Arc;
use std::time::Duration;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc::Sender;
use tokio::time::{interval, timeout};
use tokio_tungstenite::tungstenite::Message;

use super::{EmitFn, ScanConfig, ScanEvent};

/// Connect to the indexer WS endpoint, send the `sync` request, stream binary
/// `height|len|blob` frames into `tx`, and keep the connection alive with pings.
///
/// On terminal conditions (synced / error / stall / close), the function returns,
/// dropping `tx` so the scan loop can finalize.
pub async fn run_ws(cfg: Arc<ScanConfig>, tx: Sender<(u32, Vec<u8>)>, emit: EmitFn) {
    // Connect with a first-frame timeout; both ws:// and wss:// are handled by
    // tokio-tungstenite's scheme detection (rustls picked via crate features from Task 1).
    let (ws, _resp) = match timeout(
        Duration::from_millis(cfg.first_frame_timeout_ms),
        tokio_tungstenite::connect_async(cfg.ws_url.as_str()),
    )
    .await
    {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => {
            emit(ScanEvent::Error { code: "unsupported".into(), message: format!("connect: {e}") });
            return;
        }
        Err(_) => {
            emit(ScanEvent::Error { code: "unsupported".into(), message: "connect timeout".into() });
            return;
        }
    };

    let (mut write, mut read) = ws.split();

    // Send the sync request; indexer will start streaming silent blocks in reply.
    let sync_msg = serde_json::json!({
        "event": "sync",
        "data": { "from": cfg.from, "to": cfg.to, "filterSpent": cfg.filter_spent }
    });
    if let Err(e) = write.send(Message::Text(sync_msg.to_string())).await {
        emit(ScanEvent::Error { code: "socket".into(), message: format!("sync send: {e}") });
        return;
    }

    let mut received_any = false;
    let mut last_height = cfg.from.saturating_sub(1);
    let mut hb = interval(Duration::from_millis(cfg.heartbeat_interval_ms));
    hb.tick().await; // consume the immediate first tick so the first real tick fires after the interval

    loop {
        tokio::select! {
            // Heartbeat: send a WS ping to keep proxies and the server from timing out.
            _ = hb.tick() => {
                let _ = write.send(Message::Ping(vec![])).await;
            }

            // Idle timeout: wraps read.next() so we detect stalls.
            // Dropping the inner future on hb branch fires is safe: tungstenite buffers
            // complete frames internally, so no data is lost across select! iterations.
            msg_result = timeout(Duration::from_millis(cfg.idle_timeout_ms), read.next()) => {
                let msg = match msg_result {
                    Err(_) => {
                        emit(ScanEvent::Error { code: "stalled".into(), message: "idle timeout".into() });
                        return;
                    }
                    Ok(None) => {
                        // Stream closed cleanly.
                        if !received_any {
                            emit(ScanEvent::Error { code: "unsupported".into(), message: "closed before data".into() });
                        }
                        return; // tx drops → scan loop flushes and emits Done
                    }
                    Ok(Some(Ok(m))) => m,
                    Ok(Some(Err(e))) => {
                        emit(ScanEvent::Error {
                            code: if received_any { "socket" } else { "unsupported" }.into(),
                            message: e.to_string(),
                        });
                        return;
                    }
                };

                match msg {
                    // Binary frame: height(4 BE) | len(4 BE) | silent_block_bytes
                    Message::Binary(buf) if buf.len() >= 8 => {
                        received_any = true;
                        let height = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
                        if height <= last_height {
                            continue; // dedupe / order guard
                        }
                        last_height = height;
                        if tx.send((height, buf)).await.is_err() {
                            return; // scan loop is gone
                        }
                    }
                    Message::Text(t) => {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                            match v.get("event").and_then(|e| e.as_str()) {
                                Some("synced") => return, // tx drops → loop flushes + done
                                Some("error") => {
                                    let m = v
                                        .pointer("/data/message")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("unknown");
                                    emit(ScanEvent::Error { code: "socket".into(), message: m.into() });
                                    return;
                                }
                                _ => {}
                            }
                        }
                    }
                    Message::Close(_) => {
                        if !received_any {
                            emit(ScanEvent::Error { code: "unsupported".into(), message: "closed".into() });
                        }
                        return;
                    }
                    _ => {} // Pong, short Binary, etc. — ignore
                }
            }
        }
    }
}
