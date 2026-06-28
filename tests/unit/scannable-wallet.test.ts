import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';
import { RustTransactionProcessor } from '../../helpers/silent-payments/RustTransactionProcessor';
import * as bip39 from 'bip39';
import type { SilentPaymentUTXO } from '../../helpers/silent-payments/types';

// x-only pubkey: secp256k1 generator point Gx (valid BIP340 point)
const VALID_XONLY_PUBKEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const ZERO_TWEAK_HEX = '0000000000000000000000000000000000000000000000000000000000000000';

function makeSeed() {
  return bip39.mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
}

// Promoted to module level so both describe blocks can use it.
function makeUTXO(txid = 'a'.repeat(64)): SilentPaymentUTXO {
  return {
    txid,
    vout: 0,
    value: 1000,
    height: 800000,
    address: 'bc1ptest',
    silentPaymentAddress: 'sp1qtest',
    pubKey: VALID_XONLY_PUBKEY,
    tweak: new Uint8Array(32),
    blockHash: '',
    blockTime: 0,
    isSpent: false,
  };
}

describe('HDSilentPaymentsWallet scan-control surface', () => {
  const SCAN_METHODS = [
    'getScanState',
    'setOnScanStateChangeCallback',
    'pauseScan',
    'resumeScan',
    'cancelScan',
    'isScanActive',
    'fetchTransactions',
  ] as const;

  it.each(SCAN_METHODS)('exposes %s()', method => {
    const wallet = new HDSilentPaymentsWallet();
    expect(typeof (wallet as unknown as Record<string, unknown>)[method]).toBe('function');
  });

  it('reports no active scan on a freshly constructed wallet', () => {
    const wallet = new HDSilentPaymentsWallet();
    expect(wallet.isScanActive()).toBe(false);
  });
});

describe('RustTransactionProcessor.convertRawMatches', () => {
  it('maps engine matches to SilentPaymentUTXO with placeholder fields', () => {
    const processor = new RustTransactionProcessor(makeSeed());
    const spAddress = 'sp1qqtest';

    const result = processor.convertRawMatches(
      [
        {
          txid: 'a'.repeat(64),
          vout: 0,
          value: 50000,
          height: 800000,
          pubKey: VALID_XONLY_PUBKEY,
          tweakHex: ZERO_TWEAK_HEX,
        },
      ],
      spAddress,
    );

    expect(result).toHaveLength(1);
    const utxo = result[0];
    expect(utxo.address).toBeTruthy();         // derived from pubKey via p2tr
    expect(utxo.tweak).toBeInstanceOf(Uint8Array);
    expect(utxo.tweak).toHaveLength(32);
    expect(utxo.isSpent).toBe(false);           // placeholder
    expect(utxo.blockHash).toBe('');            // placeholder
    expect(utxo.blockTime).toBe(0);             // placeholder
    expect(utxo.silentPaymentAddress).toBe(spAddress);
    expect(utxo.txid).toBe('a'.repeat(64));
    expect(utxo.value).toBe(50000);
  });
});

describe('HDSilentPaymentsWallet addUTXOs / advanceScanHeight', () => {
  it('addUTXOs adds UTXOs without touching lastScannedBlock', () => {
    const wallet = new HDSilentPaymentsWallet();
    expect(wallet.getScanState().lastScannedBlock).toBe(0);

    const added = (wallet as any).addUTXOs([makeUTXO()]);
    expect(added).toBe(1);
    expect(wallet.getScanState().lastScannedBlock).toBe(0); // untouched
  });

  it('advanceScanHeight is monotonic — never moves backwards', () => {
    const wallet = new HDSilentPaymentsWallet();

    (wallet as any).advanceScanHeight(100);
    expect(wallet.getScanState().lastScannedBlock).toBe(100);

    (wallet as any).advanceScanHeight(50);
    expect(wallet.getScanState().lastScannedBlock).toBe(100); // unchanged
  });
});

describe('HDSilentPaymentsWallet persistence throttle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000); // start at t=10s so _lastPersistTime=0 is always stale
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('throttles onPersistCallback: many rapid advances within window → 1 call', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    for (let h = 800001; h <= 800010; h++) {
      (wallet as any).advanceScanHeight(h, { persist: true });
    }

    expect(persist).toHaveBeenCalledTimes(1);
    // in-memory reflects all advances
    expect(wallet.getScanState().lastScannedBlock).toBe(800010);
  });

  it('allows another persist after throttle window elapses', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    (wallet as any).advanceScanHeight(800001, { persist: true });
    expect(persist).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(3001);
    (wallet as any).advanceScanHeight(800002, { persist: true });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('force:true persists immediately regardless of throttle window', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    (wallet as any).advanceScanHeight(800001, { persist: true });          // fires (1)
    (wallet as any).advanceScanHeight(800002, { persist: true, force: true }); // force: fires (2)
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('_flushScanPersist always persists regardless of throttle', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    (wallet as any).advanceScanHeight(800001, { persist: true }); // fires (1), now throttled
    (wallet as any).advanceScanHeight(800002, { persist: true }); // throttled: no call
    (wallet as any)._flushScanPersist();                          // unconditional: fires (2)
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('lastScannedBlock updates on every advance regardless of throttle', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    for (let h = 800001; h <= 800020; h++) {
      (wallet as any).advanceScanHeight(h, { persist: true });
    }

    expect(wallet.getScanState().lastScannedBlock).toBe(800020);
    expect(persist).toHaveBeenCalledTimes(1); // only first call fired
  });

  it('commitUTXOs results in exactly one onPersistCallback (no double-persist)', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    (wallet as any).commitUTXOs([makeUTXO()], 800001);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('commitUTXOs with empty UTXOs still persists height advance once', () => {
    const wallet = new HDSilentPaymentsWallet();
    const persist = jest.fn();
    (wallet as any).onPersistCallback = persist;

    (wallet as any).commitUTXOs([], 800001);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
