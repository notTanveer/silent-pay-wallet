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
