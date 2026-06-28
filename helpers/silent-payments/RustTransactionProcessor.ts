import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { getScanPrivateKey, getSpendPublicKey } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';
import {
  spScanTransactions,
  spScanSingleTransaction,
  spScanSilentBlockRangeAsync,
  RustMatchedUTXO,
  RustBatchScanResult,
} from '../../modules/RustJsiBridge';
import { hexToUint8Array } from '../../modules/uint8array-extras';

export class RustTransactionProcessor {
  private scanPrivkeyHex: string;
  private spendPubkeyHex: string;

  constructor(seed: Buffer) {
    const scanPrivkey = getScanPrivateKey(seed);
    const spendPubkey = getSpendPublicKey(seed);

    this.scanPrivkeyHex = Buffer.from(scanPrivkey).toString('hex');
    this.spendPubkeyHex = Buffer.from(spendPubkey).toString('hex');
  }

  private convertToSilentPaymentUTXO(rustUtxo: RustMatchedUTXO, silentPaymentAddress: string): SilentPaymentUTXO {
    return {
      txid: rustUtxo.txid,
      vout: rustUtxo.vout,
      value: rustUtxo.value,
      height: rustUtxo.height,
      address: bitcoin.payments.p2tr({
        pubkey: hexToUint8Array(rustUtxo.pubKey),
      }).address!,

      // sp specific fields
      silentPaymentAddress,
      pubKey: rustUtxo.pubKey,
      tweak: hexToUint8Array(rustUtxo.tweakHex),
      blockHash: rustUtxo.blockHash,
      isSpent: rustUtxo.isSpent,
      blockTime: rustUtxo.blockTime,
    };
  }

  /**
   * Convert raw WS-engine match events (no isSpent/blockHash/blockTime) into
   * SilentPaymentUTXOs by padding placeholder fields and delegating to
   * convertToSilentPaymentUTXO. Resolution of those fields happens later.
   */
  public convertRawMatches(
    rawUtxos: Array<{ txid: string; vout: number; value: number; height: number; pubKey: string; tweakHex: string }>,
    silentPaymentAddress: string,
  ): SilentPaymentUTXO[] {
    return rawUtxos.map(raw =>
      this.convertToSilentPaymentUTXO(
        { ...raw, isSpent: false, blockHash: '', blockTime: 0 },
        silentPaymentAddress,
      ),
    );
  }

  async processBatch(
    transactions: IndexerTransaction[],
    silentPaymentAddress: string,
    cancelScanCallback?: () => boolean,
  ): Promise<SilentPaymentUTXO[]> {
    if (transactions.length === 0) {
      return [];
    }

    if (cancelScanCallback?.()) {
      return [];
    }

    try {
      const result: RustBatchScanResult = spScanTransactions(this.scanPrivkeyHex, this.spendPubkeyHex, transactions);

      console.log(
        `[RustTransactionProcessor] Scanned ${result.transactionsScanned} txs, ` +
          `${result.outputsScanned} outputs, found ${result.matchedUtxos.length} matches`,
      );

      return result.matchedUtxos.map(utxo => this.convertToSilentPaymentUTXO(utxo, silentPaymentAddress));
    } catch (error) {
      console.error('[RustTransactionProcessor] Batch processing error:', error);
      throw error;
    }
  }

  /**
   * Scan a range of binary silent blocks (from the indexer's `/silent-block/range`
   * endpoint) for payments to this wallet. `frames` is passed directly as an
   * ArrayBuffer into the JSI bridge — no base64 encoding occurs on either side.
   *
   * The returned UTXOs have placeholder `isSpent`/`blockHash`/`blockTime` values
   * (the binary format omits them); callers must resolve those per matched txid.
   */
  async processSilentBlockFrames(
    frames: Uint8Array,
    silentPaymentAddress: string,
    cancelScanCallback?: () => boolean,
  ): Promise<SilentPaymentUTXO[]> {
    if (frames.length === 0) {
      return [];
    }

    if (cancelScanCallback?.()) {
      return [];
    }

    try {
      const date = Date.now();

      // Off the JS thread: native copies the buffer, scans on a worker thread, resolves
      // via the CallInvoker. ponytail: falls back to sync global on older native binaries.
      const result: RustBatchScanResult = await spScanSilentBlockRangeAsync(
        this.scanPrivkeyHex,
        this.spendPubkeyHex,
        frames.buffer as ArrayBuffer,
      );

      const scanTime = Date.now() - date;

      console.log(
        `[RustTransactionProcessor] (binary) input ${frames.length} bytes (${(frames.length / 1024).toFixed(1)} KB), ` +
          `rust-scan ${scanTime}ms — ` +
          `scanned ${result.transactionsScanned} txs, ${result.outputsScanned} outputs, ` +
          `found ${result.matchedUtxos.length} matches`,
      );

      return result.matchedUtxos.map(utxo => this.convertToSilentPaymentUTXO(utxo, silentPaymentAddress));
    } catch (error) {
      console.error('[RustTransactionProcessor] Binary batch processing error:', error);
      throw error;
    }
  }

  clear(): void {
    this.scanPrivkeyHex = '0'.repeat(64);
    this.spendPubkeyHex = '0'.repeat(66);
    this.scanPrivkeyHex = '';
    this.spendPubkeyHex = '';
  }
}

export function createTransactionProcessor(seed: Buffer): RustTransactionProcessor {
  return new RustTransactionProcessor(seed);
}
