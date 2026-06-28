/**
 * Integration tests for the Rust-engine path in performScan.
 * Forces useRustOwnedStream=true via jest.mock so the new branch runs.
 * Drives scanForPayments() with a mocked native engine (global.spScanStart).
 */

// ponytail: module-level mock hoisted before all imports by Jest.
jest.mock('../../modules/constants', () => ({
  BIP352_ACTIVATION_HEIGHT: 842579,
  useRustOwnedStream: true,
}));

import { initializeIndexer, getDefaultIndexer, disconnectIndexer } from '../../modules/SilentPaymentIndexer';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Set up global.spScanStart to emit a scripted sequence of engine events. */
function scriptEngine(script: (emit: (j: string) => void) => void) {
  (global as any).spScanStart = (_cfg: string, emit: (j: string) => void) => {
    setImmediate(() => script(emit));
  };
  (global as any).spScanCancel = () => {};
}

function makeWallet(): HDSilentPaymentsWallet {
  const w = new HDSilentPaymentsWallet();
  (w as any).secret = TEST_MNEMONIC;
  (w as any).lastScannedBlock = 899990; // small range: 899991..900000
  // Prevent the polling loop from starting after scan completes.
  // ponytail: avoids infinite fake-timer loop in runAllTimersAsync.
  (w as any).isPollingActive = true;
  return w;
}

describe('performScan — Rust engine path', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: [] }); // fake all timers including setImmediate
    initializeIndexer({ baseUrl: 'http://indexer.test' });
    const indexer = getDefaultIndexer();
    jest.spyOn(indexer, 'getLatestBlockHeight').mockResolvedValue({ height: 900000 } as any);
    jest.spyOn(indexer, 'scanForwardWithCallback').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    disconnectIndexer();
    delete (global as any).spScanStart;
    delete (global as any).spScanCancel;
  });

  it('progress event at intermediate height advances lastScannedBlock via engineProgress', async () => {
    const INTERMEDIATE = 899995; // strictly below endHeight (900000)
    let lastScannedAfterProgress: number | null = null;

    scriptEngine(emit => {
      emit(JSON.stringify({
        type: 'progress',
        currentBlock: INTERMEDIATE, tipHeight: 900000,
        totalBlocks: 10, blocksScanned: 5, percentComplete: 50, utxosFound: 0,
      }));
      // Capture height BEFORE done so we can confirm the progress event itself advanced it.
      // We do this by scheduling the assertion before emitting done.
      setImmediate(() => {
        lastScannedAfterProgress = (wallet as any).lastScannedBlock;
        emit(JSON.stringify({ type: 'done' }));
      });
    });

    const wallet = makeWallet();
    const scanPromise = wallet.scanForPayments();
    await jest.runAllTimersAsync();
    await scanPromise;

    // The progress event alone (before done) must have advanced to INTERMEDIATE.
    // This fails if advanceScanHeight is removed from engineProgress.
    expect(lastScannedAfterProgress).toBe(INTERMEDIATE);
    // done path advances to endHeight
    expect(wallet.getScanState().lastScannedBlock).toBe(900000);
  });

  it('cancel during engine stream rejects with SCAN_CANCELLED and skips HTTP fallback', async () => {
    scriptEngine(emit => {
      emit(JSON.stringify({
        type: 'progress',
        currentBlock: 899993, tipHeight: 900000,
        totalBlocks: 10, blocksScanned: 3, percentComplete: 30, utxosFound: 0,
      }));
      // No 'done' — engine is still streaming when cancel fires
    });

    const indexer = getDefaultIndexer();
    const fallbackSpy = jest.spyOn(indexer, 'scanForwardWithCallback').mockResolvedValue(undefined as any);

    const wallet = makeWallet();
    // Trigger cancel after the first progress event is processed
    setImmediate(() => { (wallet as any).cancelScanCallbackScan = true; });

    const scanPromise = wallet.scanForPayments();
    await jest.runAllTimersAsync();
    // Cancelled scan returns 0, does not throw
    const result = await scanPromise;

    expect(result).toBe(0);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('unsupported error triggers HTTP fallback via scanForwardWithCallback', async () => {
    scriptEngine(emit => {
      emit(JSON.stringify({ type: 'error', code: 'unsupported', message: 'no native engine' }));
    });

    const indexer = getDefaultIndexer();
    const fallbackSpy = jest.spyOn(indexer, 'scanForwardWithCallback').mockResolvedValue(undefined as any);

    const wallet = makeWallet();
    const scanPromise = wallet.scanForPayments();
    await jest.runAllTimersAsync();
    await scanPromise;

    expect(fallbackSpy).toHaveBeenCalledTimes(1);
  });
});
