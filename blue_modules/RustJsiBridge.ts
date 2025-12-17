import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The 'RustJsiBridge' module is not properly linked. ` +
  `Please ensure you've rebuilt the app after adding the native module.\n\n` +
  Platform.select({
    ios: "- Run 'cd ios && pod install && cd ..'\n",
    android: "- Ensure CMakeLists.txt is properly configured\n",
    default: ''
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
      }
    );

// ============================================================================
// Type Definitions
// ============================================================================

/** Matched UTXO from Rust scanner */
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

/** Batch scan result from Rust */
export interface RustBatchScanResult {
  matchedUtxos: RustMatchedUTXO[];
  transactionsScanned: number;
  outputsScanned: number;
}

/** Error result from Rust */
interface RustErrorResult {
  error: string;
}

// Type definitions for global JSI functions
interface RustJsiBridgeGlobal {
  helloFromRust: () => string;
  multiplyFromRust: (a: number, b: number) => number;
  spScanTransactions: (scanPrivkeyHex: string, spendPubkeyHex: string, transactionsJson: string) => string;
  spScanSingleTransaction: (scanPrivkeyHex: string, spendPubkeyHex: string, transactionJson: string) => string;
}

// ============================================================================
// Initialization
// ============================================================================

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

// ============================================================================
// Original Example Functions
// ============================================================================

export function helloFromRust(): string {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }
  return getGlobal().helloFromRust();
}

export function multiplyFromRust(a: number, b: number): number {
  if (!isInstalled) {
    throw new Error('RustJsiBridge not installed. Call initializeRustJsiBridge() first.');
  }
  return getGlobal().multiplyFromRust(a, b);
}

// ============================================================================
// Silent Payment Transaction Scanning
// ============================================================================

/**
 * Scan multiple transactions for Silent Payment outputs using parallel processing.
 * This is the high-performance Rust implementation using rayon's par_iter.
 * 
 * @param scanPrivkeyHex - 32-byte scan private key as hex string
 * @param spendPubkeyHex - 33-byte compressed spend public key as hex string
 * @param transactions - Array of IndexerTransaction objects
 * @returns BatchScanResult with matched UTXOs and statistics
 */
export function spScanTransactions<T extends { id: string; blockHeight: number; blockHash: string; blockTime: number; scanTweak: string; outputs: Array<{ transactionId: string; vout: number; pubKey: string; value: number; isSpent: boolean | number }> }>(
  scanPrivkeyHex: string,
  spendPubkeyHex: string,
  transactions: T[]
): RustBatchScanResult {
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

/**
 * Scan a single transaction for Silent Payment outputs.
 * Use this for incremental/real-time scanning of new transactions.
 * 
 * @param scanPrivkeyHex - 32-byte scan private key as hex string
 * @param spendPubkeyHex - 33-byte compressed spend public key as hex string
 * @param transaction - Single IndexerTransaction object
 * @returns Array of matched UTXOs (empty if no matches)
 */
export function spScanSingleTransaction<T extends { id: string; blockHeight: number; blockHash: string; blockTime: number; scanTweak: string; outputs: Array<{ transactionId: string; vout: number; pubKey: string; value: number; isSpent: boolean | number }> }>(
  scanPrivkeyHex: string,
  spendPubkeyHex: string,
  transaction: T
): RustMatchedUTXO[] {
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

// Export module for advanced use cases
export { RustJsiBridgeModule };
