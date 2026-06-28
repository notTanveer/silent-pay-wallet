import type { ScanProgressCallback, ScanRangeHandlers } from '../helpers/silent-payments/types';
import type { RustScanEvent } from './RustJsiBridge';

/**
 * Thrown when the indexer doesn't appear to support the WebSocket `sync` stream
 * (connection refused, closes/erros before any data, or never answers the sync
 * request). Callers catch this to fall back to the HTTP range-scan path so older
 * indexer deployments keep working.
 */
export class StreamUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamUnsupportedError';
  }
}

interface StreamSilentBlocksParams {
  wsUrl: string;
  from: number;
  to: number;
  filterSpent?: boolean;
  handlers: Pick<ScanRangeHandlers, 'processBinaryRange'>;
  onProgress?: ScanProgressCallback;
  cancelCallback?: () => boolean;
  /** Flush accumulated frames into the Rust scanner once this many bytes are buffered. */
  flushBytes?: number;
  /** If the server sends nothing this long after we ask, treat it as unsupported. */
  firstFrameTimeoutMs?: number;
  /** Abort if the stream stalls mid-flight (no message) for this long. */
  idleTimeoutMs?: number;
  /** Send a no-op JSON ping this often to prevent proxy keepalive timeouts. */
  heartbeatIntervalMs?: number;
}

// ~ one 200-block HTTP chunk's worth of bytes; keeps the Rust scan batched.
const DEFAULT_FLUSH_BYTES = 1_500_000;
const DEFAULT_FIRST_FRAME_TIMEOUT = 15_000;
const DEFAULT_IDLE_TIMEOUT = 30_000;
// Proxies (Cloudflare Tunnel, nginx) typically close idle WebSocket connections
// after 60–300 s. Sending a no-op ping every 20 s keeps the TCP session alive.
const DEFAULT_HEARTBEAT_INTERVAL = 20_000;

/** http(s)://host[:port] -> ws(s)://host[:port] (the WS gateway shares the HTTP server). */
export function deriveWsUrl(baseUrl: string): string {
  return baseUrl.replace(/^http/i, 'ws');
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): Uint8Array {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  // multiply for the top byte to avoid sign issues from `<< 24`
  return buf[offset] * 0x1000000 + ((buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]);
}

/**
 * Stream a contiguous range of binary silent blocks from the indexer over one
 * WebSocket connection, delegating each flushed batch to `handlers.processBinaryRange`.
 *
 * Resolves once the server reports `synced` and all batches have been processed.
 * Rejects with {@link StreamUnsupportedError} when the endpoint looks unavailable
 * (caller should fall back to HTTP), with `SCAN_CANCELLED` when cancelled, or with
 * a generic Error if the stream drops mid-flight.
 *
 * Each binary WS message is one self-describing `height(4 BE) | len(4 BE) | blob`
 * frame; frames arrive in contiguous ascending height order.
 */
export function streamSilentBlocks(params: StreamSilentBlocksParams): Promise<void> {
  const {
    wsUrl,
    from,
    to,
    filterSpent = true,
    handlers,
    onProgress,
    cancelCallback,
    flushBytes = DEFAULT_FLUSH_BYTES,
    firstFrameTimeoutMs = DEFAULT_FIRST_FRAME_TIMEOUT,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL,
  } = params;

  return new Promise<void>((resolve, reject) => {
    const totalBlocks = to - from + 1;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      reject(new StreamUnsupportedError(`WebSocket connect failed: ${String(err)}`));
      return;
    }
    ws.binaryType = 'arraybuffer';

    let settled = false;
    let receivedAny = false;
    let streamingStarted = false;
    let lastHeight = from - 1;
    let blocksScanned = 0;
    let utxosFound = 0;
    let lastProgressEmit = 0;

    // Accumulated frames awaiting a flush to the (sequential) Rust scanner.
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let pendingMaxHeight = from - 1;

    // processBinaryRange commits UTXOs and advances lastScannedBlock, so batches
    // must run one at a time and in order — chain them.
    let processingChain: Promise<void> = Promise.resolve();
    let chainError: Error | null = null;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const startHeartbeat = () => {
      if (heartbeat !== null) return;
      heartbeat = setInterval(() => {
        try {
          if (ws.readyState !== WebSocket.OPEN) return;
          // Use native WebSocket ping frame (opcode 0x9) — this is what proxies
          // (Cloudflare Tunnel, nginx, etc.) actually look for. An application-level
          // JSON message is just payload data that proxies ignore for keepalive.
          // React Native exposes ws.ping() for this; fall back to a JSON no-op only
          // if the native method isn't available (older RN versions).
          if (typeof (ws as any).ping === 'function') {
            (ws as any).ping();
          } else {
            ws.send(JSON.stringify({ event: 'ping' }));
          }
        } catch {
          /* noop — if the socket is gone the next onerror/onclose will handle it */
        }
      }, heartbeatIntervalMs);
    };

    const cleanup = () => {
      clearTimer();
      if (heartbeat !== null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
      } catch {
        /* noop */
      }
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        /* noop */
      }
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const armTimer = (ms: number, makeErr: () => Error) => {
      clearTimer();
      timer = setTimeout(() => fail(makeErr()), ms);
    };

    const finalize = () => {
      // Resolve only after every queued batch has finished processing.
      processingChain.then(() => {
        if (!chainError) succeed();
      });
    };

    const flush = (final: boolean) => {
      if (pending.length === 0) {
        if (final) finalize();
        return;
      }

      const batch = concatChunks(pending, pendingBytes);
      const maxHeight = pendingMaxHeight;
      pending = [];
      pendingBytes = 0;

      processingChain = processingChain
        .then(async () => {
          if (chainError) return;
          if (cancelCallback?.()) throw new Error('SCAN_CANCELLED');
          const added = await handlers.processBinaryRange(batch, maxHeight);
          utxosFound += added;
          blocksScanned = maxHeight - from + 1;
          onProgress?.({
            currentBlock: maxHeight,
            tipHeight: to,
            totalBlocks,
            blocksScanned,
            percentComplete: totalBlocks > 0 ? (blocksScanned / totalBlocks) * 100 : 100,
            utxosFound,
          });
        })
        .catch((e: Error) => {
          chainError = e;
          fail(e);
        });

      if (final) finalize();
    };

    ws.onopen = () => {
      armTimer(firstFrameTimeoutMs, () => new StreamUnsupportedError('No response to sync request (indexer may not support streaming)'));
      try {
        ws.send(JSON.stringify({ event: 'sync', data: { from, to, filterSpent } }));
      } catch (err) {
        fail(new StreamUnsupportedError(`Failed to send sync request: ${String(err)}`));
      }
    };

    ws.onmessage = (event: any) => {
      if (settled) return;
      receivedAny = true;

      const data = event.data;

      if (typeof data === 'string') {
        let msg: any;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }
        if (msg?.event === 'synced') {
          clearTimer();
          flush(true);
        } else if (msg?.event === 'pong') {
          // Server acknowledged our heartbeat ping — connection is alive.
          // Reset the stall timer so a slow LMDB scan between frames doesn't
          // time us out as long as the server keeps responding to pings.
          if (streamingStarted) {
            armTimer(idleTimeoutMs, () => new Error('Silent-block stream stalled'));
          }
        } else if (msg?.event === 'error') {
          fail(new Error(`Indexer stream error: ${msg?.data?.message ?? 'unknown'}`));
        }
        return;
      }

      // Binary frame.
      streamingStarted = true;
      armTimer(idleTimeoutMs, () => new Error('Silent-block stream stalled'));
      startHeartbeat(); // keep the proxy connection alive once streaming begins
      const frame = new Uint8Array(data as ArrayBuffer);
      if (frame.length < 8) return;

      const height = readUint32BE(frame, 0);
      if (height <= lastHeight) return; // dedupe / ordering guard
      lastHeight = height;

      pending.push(frame);
      pendingBytes += frame.length;
      pendingMaxHeight = height;

      if (cancelCallback?.()) {
        fail(new Error('SCAN_CANCELLED'));
        return;
      }

      const now = Date.now();
      if (onProgress && now - lastProgressEmit >= 250) {
        lastProgressEmit = now;
        const scannedSoFar = lastHeight - from + 1;
        onProgress({
          currentBlock: lastHeight,
          tipHeight: to,
          totalBlocks,
          blocksScanned: scannedSoFar,
          percentComplete: totalBlocks > 0 ? (scannedSoFar / totalBlocks) * 100 : 0,
          utxosFound,
        });
      }

      if (pendingBytes >= flushBytes) flush(false);
    };

    ws.onerror = (event: any) => {
      const detail = event?.message ?? event?.type ?? 'unknown';
      console.warn(`[WS] onerror — receivedAny=${receivedAny} lastHeight=${lastHeight} detail="${detail}"`);
      // No data yet → endpoint probably isn't there; signal a fallback to HTTP.
      fail(
        receivedAny
          ? new Error(`Silent-block stream socket error: ${detail}`)
          : new StreamUnsupportedError(`WebSocket error before any data: ${detail}`),
      );
    };

    ws.onclose = (event: any) => {
      if (settled) return;
      const code = event?.code ?? '?';
      const reason = event?.reason ?? '';
      console.warn(`[WS] onclose — receivedAny=${receivedAny} lastHeight=${lastHeight} code=${code} reason="${reason}"`);
      fail(
        receivedAny
          ? new Error(`Silent-block stream closed prematurely (code ${code}${reason ? `: ${reason}` : ''})`)
          : new StreamUnsupportedError(`WebSocket closed before any data (code ${code})`),
      );
    };
  });
}

// ─── Rust-owned stream engine bridge (Phase 2 / Task 6) ─────────────────────

/** Handler shape for streamViaRustEngine — extends the WS path's handler with onMatch. */
interface RustStreamHandlers {
  onMatch(utxos: Array<{ txid: string; vout: number; value: number; height: number; pubKey: string; tweakHex: string }>): Promise<void>;
}

interface StreamViaRustEngineParams {
  wsUrl: string;
  from: number;
  to: number;
  scanPrivkeyHex: string;
  spendPubkeyHex: string;
  handlers: RustStreamHandlers;
  onProgress?: ScanProgressCallback;
  cancelCallback?: () => boolean;
}

/**
 * Drive the Rust-owned stream scan engine (JSI globals installed by Task 5).
 * Maps engine events onto the existing onProgress / handlers.onMatch contract.
 * Additive — not referenced by production code until Phase 3 wires performScan.
 *
 * ponytail: calls global.spScanStart directly so tests can mock it without
 * needing a native module installed (bypasses RustJsiBridge.isInstalled guard).
 */
export function streamViaRustEngine(params: StreamViaRustEngineParams): Promise<void> {
  const { wsUrl, from, to, scanPrivkeyHex, spendPubkeyHex, handlers, onProgress, cancelCallback } = params;
  const g = global as any;

  return new Promise<void>((resolve, reject) => {
    if (typeof g.spScanStart !== 'function') {
      reject(new StreamUnsupportedError('spScanStart not available — native engine not installed'));
      return;
    }

    const configJson = JSON.stringify({ wsUrl, from, to, scanPrivkeyHex, spendPubkeyHex });

    // Wire cancelCallback to spScanCancel so the caller can abort.
    const origCancel = cancelCallback;
    let cancelPollId: ReturnType<typeof setInterval> | undefined;

    const pendingMatches: Promise<void>[] = [];

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (cancelPollId !== undefined) { clearInterval(cancelPollId); cancelPollId = undefined; }
      fn();
    };

    if (origCancel) {
      // ponytail: poll every 250ms; cleared in settle so it stops on done/error/cancel.
      cancelPollId = setInterval(() => {
        if (origCancel()) {
          g.spScanCancel?.();
          settle(() => reject(new Error('SCAN_CANCELLED')));
        }
      }, 250);
    }

    g.spScanStart(configJson, (eventJson: string) => {
      if (settled) return;
      let event: RustScanEvent;
      try {
        event = JSON.parse(eventJson) as RustScanEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'progress':
          onProgress?.({
            currentBlock: event.currentBlock,
            tipHeight: event.tipHeight,
            totalBlocks: event.totalBlocks,
            blocksScanned: event.blocksScanned,
            percentComplete: event.percentComplete,
            utxosFound: event.utxosFound,
          });
          break;
        case 'match':
          // Collect pending onMatch promises; done awaits all before resolving so
          // a late onMatch rejection is not silently swallowed by the settled guard.
          pendingMatches.push(handlers.onMatch(event.utxos));
          break;
        case 'done':
          Promise.allSettled(pendingMatches).then(results => {
            const failed = results.find(r => r.status === 'rejected');
            if (failed) settle(() => reject((failed as PromiseRejectedResult).reason));
            else settle(() => resolve());
          });
          break;
        case 'error':
          settle(() =>
            reject(
              event.code === 'unsupported'
                ? new StreamUnsupportedError(event.message)
                : new Error(event.message),
            ),
          );
          break;
      }
    });
  });
}
