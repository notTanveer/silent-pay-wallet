import { IndexerHttpClient, IndexerHttpError } from '../helpers/silent-payments/IndexerHttpClient';
import { deriveWsUrl, StreamUnsupportedError, streamSilentBlocks } from './SilentBlockStreamClient';
import type {
  HealthResponse,
  LatestBlockHeightResponse,
  BlockHeightByTimestampResponse,
  TransactionResponse,
  IndexerTransaction,
  SilentPaymentIndexerConfig,
  ScanProgressCallback,
  ScanRangeHandlers,
  TransactionByTxidResponse,
} from '../helpers/silent-payments/types';

/** A fetched range, either as the binary silent-block frames or legacy JSON transactions. */
type RangePayload = { kind: 'binary'; frames: Uint8Array } | { kind: 'json'; transactions: IndexerTransaction[] };

class SilentPaymentIndexer {
  private httpClient: IndexerHttpClient;

  constructor(config: SilentPaymentIndexerConfig) {
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    this.httpClient = new IndexerHttpClient(baseUrl, config.timeout);
  }

  getBaseUrl(): string {
    return this.httpClient.getBaseUrl();
  }

  setBaseUrl(url: string): void {
    this.httpClient.setBaseUrl(url);
  }

  async getHealth(): Promise<HealthResponse> {
    return this.httpClient.get<HealthResponse>('/health', 'Error fetching indexer health');
  }

  async getTransactionsByHeight(height: number): Promise<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(`/transactions/height/${height}`, `Error fetching transactions by height ${height}`);
  }

  async getTransactionsByRange(startHeight: number, endHeight: number): Promise<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(
      `/transactions/range?startHeight=${startHeight}&endHeight=${endHeight}&filterSpent=true`,
      `Error fetching transactions by range ${startHeight}-${endHeight}`,
    );
  }

  /**
   * Fetch a contiguous range of precomputed binary silent blocks. Returns the raw
   * framed buffer (`height | byteLength | silentBlockBytes` per height) for the Rust
   * parser. Throws {@link IndexerHttpError} with status 404 on indexers that predate
   * the binary endpoint, letting the scan loop fall back to the JSON path.
   */
  async getSilentBlocksRange(startHeight: number, endHeight: number): Promise<Uint8Array> {
    const t0 = Date.now();
    const frames = await this.httpClient.getBinary(
      `/silent-block/range?startHeight=${startHeight}&endHeight=${endHeight}&filterSpent=true`,
      `Error fetching silent block range ${startHeight}-${endHeight}`,
    );
    const elapsedMs = Date.now() - t0;
    const bytes = frames.length;
    const kbPerSec = elapsedMs > 0 ? (bytes / 1024) / (elapsedMs / 1000) : 0;
    console.log(
      `[Indexer] GET /silent-block/range [${startHeight}-${endHeight}] ` +
        `received ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB) in ${elapsedMs}ms ` +
        `(${kbPerSec.toFixed(1)} KB/s)`,
    );
    return frames;
  }

  async getLatestBlockHeight(): Promise<LatestBlockHeightResponse> {
    return this.httpClient.get<LatestBlockHeightResponse>('/silent-block/latest-height', 'Error fetching latest block height');
  }

  async getBlockHeightByTimestamp(timestamp: number): Promise<BlockHeightByTimestampResponse> {
    return this.httpClient.get<BlockHeightByTimestampResponse>(
      `/transactions/timestamp-to-height?timestamp=${timestamp}`,
      `Error fetching block height for timestamp ${timestamp}`,
    );
  }

  async getTransactionByTxid(txid: string): Promise<TransactionByTxidResponse> {
    return this.httpClient.get<TransactionByTxidResponse>(`/transactions/txid/${txid}`, `Error fetching transaction by txid ${txid}`);
  }

  /**
   * Scan forward over [startHeight, endHeight] in fixed-size ranges, fetching
   * precomputed binary silent blocks and delegating per-range processing to the
   * caller's handlers.
   *
   * @param {number} startHeight - Starting block height
   * @param {number} endHeight - Ending block height
   * @param {ScanRangeHandlers} handlers - Binary/JSON per-range processing callbacks
   * @param {ScanProgressCallback} onProgress - Optional progress callback
   * @param {Function} cancelCallback - Returns true to abort the scan
   */
  async scanForwardWithCallback(
    startHeight: number,
    endHeight: number,
    handlers: ScanRangeHandlers,
    onProgress?: ScanProgressCallback,
    cancelCallback?: () => boolean,
  ): Promise<void> {
    await this.scanBlocks(startHeight, endHeight, handlers, onProgress, cancelCallback);
  }

  /**
   * Sync [startHeight, endHeight] over a single WebSocket connection instead of a
   * poll loop, so the ~1.5s tunnel round-trip is paid once per session rather than
   * per 200-block chunk. Frames are delegated to `handlers.processBinaryRange`, the
   * same contract as {@link scanForwardWithCallback}.
   *
   * Rejects with {@link StreamUnsupportedError} if the indexer doesn't speak the
   * `sync` protocol (caller falls back to the HTTP range scan).
   */
  async streamForwardWithCallback(
    startHeight: number,
    endHeight: number,
    handlers: ScanRangeHandlers,
    onProgress?: ScanProgressCallback,
    cancelCallback?: () => boolean,
  ): Promise<void> {
    await streamSilentBlocks({
      wsUrl: deriveWsUrl(this.httpClient.getBaseUrl()),
      from: startHeight,
      to: endHeight,
      filterSpent: true,
      handlers,
      onProgress,
      cancelCallback,
    });
  }

  private async scanBlocks(
    startHeight: number,
    endHeight: number,
    handlers: ScanRangeHandlers,
    onProgress?: ScanProgressCallback,
    cancelCallback?: () => boolean,
  ): Promise<void> {
    const RANGE_BATCH_SIZE = 100;
    const totalBlocks = endHeight - startHeight + 1;
    let blocksScanned = 0;
    let utxosFound = 0;

    const ranges: Array<[number, number]> = [];
    for (let rangeStart = startHeight; rangeStart <= endHeight; rangeStart += RANGE_BATCH_SIZE) {
      ranges.push([rangeStart, Math.min(rangeStart + RANGE_BATCH_SIZE - 1, endHeight)]);
    }
    if (ranges.length === 0) {
      return;
    }

    // Whole-scan path decision: prefer the binary endpoint, but fall back to the
    // legacy JSON path for the remainder of the scan if it 404s (older indexer
    // deployment without /silent-block/range).
    let useJsonFallback = false;

    const fetchRange = async ([rangeStart, rangeEnd]: [number, number]): Promise<RangePayload> => {
      if (useJsonFallback) {
        const response = await this.getTransactionsByRange(rangeStart, rangeEnd);
        return { kind: 'json', transactions: response.transactions };
      }
      try {
        const frames = await this.getSilentBlocksRange(rangeStart, rangeEnd);
        return { kind: 'binary', frames };
      } catch (error) {
        if (error instanceof IndexerHttpError && error.status === 404) {
          console.warn('[Indexer] Binary /silent-block/range unavailable (404); falling back to JSON scan path');
          useJsonFallback = true;
          const response = await this.getTransactionsByRange(rangeStart, rangeEnd);
          return { kind: 'json', transactions: response.transactions };
        }
        throw error;
      }
    };

    // One-ahead prefetch: hold the next range's fetch promise while processing the
    // current one so network I/O overlaps the Rust scan.
    let prefetch: Promise<RangePayload> | undefined;
    try {
      prefetch = fetchRange(ranges[0]);

      for (let i = 0; i < ranges.length; i++) {
        if (cancelCallback?.()) {
          throw new Error('SCAN_CANCELLED');
        }

        const [rangeStart, rangeEnd] = ranges[i];

        let payload: RangePayload;
        try {
          payload = await prefetch;
        } catch (error: any) {
          if (error?.message === 'SCAN_CANCELLED') {
            throw error;
          }
          // Abort the entire scan on a fetch failure (after fetchWithRetries has
          // exhausted its retries). lastScannedBlock must never advance past a
          // range we could not fetch, or those blocks' funds are silently and
          // permanently missed.
          throw new Error(`Failed to fetch range ${rangeStart}-${rangeEnd}: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Kick off the next range's fetch before processing the current payload.
        if (i + 1 < ranges.length) {
          prefetch = fetchRange(ranges[i + 1]);
        }

        const foundInRange =
          payload.kind === 'binary'
            ? await handlers.processBinaryRange(payload.frames, rangeEnd)
            : await handlers.processJsonRange(payload.transactions, rangeEnd);

        utxosFound += foundInRange;
        blocksScanned += rangeEnd - rangeStart + 1;

        onProgress?.({
          currentBlock: rangeEnd,
          tipHeight: endHeight,
          totalBlocks,
          blocksScanned,
          percentComplete: (blocksScanned / totalBlocks) * 100,
          utxosFound,
        });
      }
    } finally {
      // On early exit (cancel/abort) the outstanding prefetch may still be
      // in-flight; swallow its result so it cannot surface as an unhandled
      // rejection. On normal completion this is an already-settled promise.
      prefetch?.catch(() => {});
    }
  }
}

let defaultIndexer: SilentPaymentIndexer | null = null;

export function initializeIndexer(config: SilentPaymentIndexerConfig): void {
  defaultIndexer = new SilentPaymentIndexer(config);
}

export function getDefaultIndexer(): SilentPaymentIndexer {
  if (!defaultIndexer) {
    throw new Error('Silent Payment Indexer not initialized. Call initializeIndexer() first.');
  }
  return defaultIndexer;
}

export function disconnectIndexer(): void {
  defaultIndexer = null;
}

export { StreamUnsupportedError } from './SilentBlockStreamClient';
