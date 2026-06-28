import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The 'RustJsiBridge' module is not properly linked. ` +
  `Please ensure you've rebuilt the app after adding the native module.\n\n` +
  Platform.select({
    ios: "- Run 'cd ios && pod install && cd ..'\n",
    android: '- Ensure CMakeLists.txt is properly configured\n',
    default: '',
  }) +
  `- Rebuild the app (npx react-native run-ios or run-android)`;

const RustJsiBridgeModule = NativeModules.RustJsiBridge
  ? NativeModules.RustJsiBridge
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    );

export interface RustMatchedUTXO {
  txid: string;
  vout: number;
  value: number;
  height: number;
  pubKey: string;
  tweakHex: string;
  blockHash: string;
  blockTime: number;
  isSpent: boolean;
}

export interface RustBatchScanResult {
  matchedUtxos: RustMatchedUTXO[];
  transactionsScanned: number;
  outputsScanned: number;
}

interface RustErrorResult {
  error: string;
}

interface RustJsiBridgeGlobal {
  spScanTransactions: (scanPrivkeyHex: string, spendPubkeyHex: string, transactionsJson: string) => string;
  spScanSingleTransaction: (scanPrivkeyHex: string, spendPubkeyHex: string, transactionJson: string) => string;
  // arg 3 is now an ArrayBuffer — no base64 string on this path.
  spScanSilentBlockRange: (scanPrivkeyHex: string, spendPubkeyHex: string, framesBuffer: ArrayBuffer) => string;
  // Async (off-JS-thread) variant — resolves via the native CallInvoker.
  spScanSilentBlockRangeAsync?: (scanPrivkeyHex: string, spendPubkeyHex: string, framesBuffer: ArrayBuffer) => Promise<string>;
  // Stream-engine globals (Task 5) — installed at runtime by the native module.
  spScanStart?: (configJson: string, onEvent: (eventJson: string) => void) => void;
  spScanPause?: () => void;
  spScanResume?: () => void;
  spScanCancel?: () => void;
}

/** Discriminated-union of every event the Rust stream engine can emit. */
export type RustScanEvent =
  | { type: 'progress'; currentBlock: number; tipHeight: number; totalBlocks: number; blocksScanned: number; percentComplete: number; utxosFound: number }
  | { type: 'match'; utxos: Array<{ txid: string; vout: number; value: number; height: number; pubKey: string; tweakHex: string }> }
  | { type: 'done' }
  | { type: 'error'; code: string; message: string };

let isInstalled = false;

export function initializeRustJsiBridge(): boolean {
  if (isInstalled) {
    return true;
  }

  try {
    const result = RustJsiBridgeModule.install();
    if (result) {
      isInstalled = true;
      console.log('✅ Rust JSI Bridge installed successfully');
    }
    return result;
  } catch (error) {
    console.error('❌ Failed to install Rust JSI Bridge:', error);
    return false;
  }
}

// Type-safe wrappers for JSI functions
const getGlobal = (): RustJsiBridgeGlobal => {
  return global as any as RustJsiBridgeGlobal;
};

export function spScanTransactions<
  T extends {
    id: string;
    blockHeight: number;
    blockHash: string;
    blockTime: number;
    scanTweak: string;
    outputs: Array<{ transactionId: string; vout: number; pubKey: string; value: number; isSpent: boolean | number }>;
  },
>(scanPrivkeyHex: string, spendPubkeyHex: string, transactions: T[]): RustBatchScanResult {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }

  const transactionsJson = JSON.stringify(transactions);
  const resultJson = getGlobal().spScanTransactions(scanPrivkeyHex, spendPubkeyHex, transactionsJson);
  const result: RustBatchScanResult | RustErrorResult = JSON.parse(resultJson);

  if ('error' in result) {
    throw new Error(`Rust scan error: ${result.error}`);
  }

  return result;
}

export function spScanSingleTransaction<
  T extends {
    id: string;
    blockHeight: number;
    blockHash: string;
    blockTime: number;
    scanTweak: string;
    outputs: Array<{ transactionId: string; vout: number; pubKey: string; value: number; isSpent: boolean | number }>;
  },
>(scanPrivkeyHex: string, spendPubkeyHex: string, transaction: T): RustMatchedUTXO[] {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }

  const transactionJson = JSON.stringify(transaction);
  const resultJson = getGlobal().spScanSingleTransaction(scanPrivkeyHex, spendPubkeyHex, transactionJson);
  const result: RustMatchedUTXO[] | RustErrorResult = JSON.parse(resultJson);

  if ('error' in result) {
    throw new Error(`Rust scan error: ${(result as RustErrorResult).error}`);
  }

  return result as RustMatchedUTXO[];
}

/**
 * Scan a range of binary silent-block frames fetched from the indexer's
 * `/silent-block/range` endpoint. Passes the raw `ArrayBuffer` directly to
 * Rust via the JSI ArrayBuffer API — no base64 encoding/decoding occurs on
 * either side of the bridge.
 *
 * Matches carry no isSpent/blockHash/blockTime (the binary format omits them)
 * — the caller resolves those per matched txid afterwards.
 */
export function spScanSilentBlockRange(
  scanPrivkeyHex: string,
  spendPubkeyHex: string,
  framesBuffer: ArrayBuffer,
): RustBatchScanResult {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }

  const resultJson = getGlobal().spScanSilentBlockRange(scanPrivkeyHex, spendPubkeyHex, framesBuffer);
  const result: RustBatchScanResult | RustErrorResult = JSON.parse(resultJson);

  if ('error' in result) {
    throw new Error(`Rust scan error: ${(result as RustErrorResult).error}`);
  }

  return result as RustBatchScanResult;
}

// ─── Stream-engine wrappers (Task 6) ────────────────────────────────────────

/** Start the Rust-owned stream scan. configJson is the serialised ScanConfig. */
export function spScanStart(configJson: string, onEvent: (eventJson: string) => void): void {
  if (!isInstalled) throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  const fn = getGlobal().spScanStart;
  if (!fn) throw new Error('spScanStart not available on this native build.');
  fn(configJson, onEvent);
}

export function spScanPause(): void {
  if (!isInstalled) throw new Error('RustJsiBridge not installed.');
  getGlobal().spScanPause?.();
}

export function spScanResume(): void {
  if (!isInstalled) throw new Error('RustJsiBridge not installed.');
  getGlobal().spScanResume?.();
}

export function spScanCancel(): void {
  if (!isInstalled) throw new Error('RustJsiBridge not installed.');
  getGlobal().spScanCancel?.();
}

/**
 * Off-the-JS-thread variant of {@link spScanSilentBlockRange}. The native side copies
 * the inputs, runs the scan on a worker thread, and resolves via the CallInvoker, so
 * the JS thread stays free to render. Falls back to the synchronous global on older
 * native binaries that predate the async function.
 */
export async function spScanSilentBlockRangeAsync(
  scanPrivkeyHex: string,
  spendPubkeyHex: string,
  framesBuffer: ArrayBuffer,
): Promise<RustBatchScanResult> {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }

  const g = getGlobal();
  const resultJson: string =
    typeof g.spScanSilentBlockRangeAsync === 'function'
      ? await g.spScanSilentBlockRangeAsync(scanPrivkeyHex, spendPubkeyHex, framesBuffer)
      : g.spScanSilentBlockRange(scanPrivkeyHex, spendPubkeyHex, framesBuffer); // sync fallback (older binary)

  const result: RustBatchScanResult | RustErrorResult = JSON.parse(resultJson);
  if ('error' in result) {
    throw new Error(`Rust scan error: ${(result as RustErrorResult).error}`);
  }
  return result as RustBatchScanResult;
}
