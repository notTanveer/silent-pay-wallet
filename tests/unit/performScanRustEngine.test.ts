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

  it('progress event advances lastScannedBlock via wrappedProgress', async () => {
    scriptEngine(emit => {
      emit(JSON.stringify({
        type: 'progress',
        currentBlock: 899995, tipHeight: 900000,
        totalBlocks: 10, blocksScanned: 5, percentComplete: 50, utxosFound: 0,
      }));
      emit(JSON.stringify({ type: 'done' }));
    });

    const wallet = makeWallet();
    const scanPromise = wallet.scanForPayments();
    await jest.runAllTimersAsync();
    await scanPromise;

    // wrappedProgress calls advanceScanHeight(currentBlock); done path calls advanceScanHeight(endHeight)
    expect(wallet.getScanState().lastScannedBlock).toBeGreaterThanOrEqual(899995);
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
