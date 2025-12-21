import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { getScanPrivateKey, getSpendPublicKey } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';
import { 
  initializeRustJsiBridge, 
  spScanTransactions, 
  spScanSingleTransaction,
  RustMatchedUTXO,
  RustBatchScanResult
} from '../../blue_modules/RustJsiBridge';
import { hexToUint8Array } from '../../blue_modules/uint8array-extras';


export class RustTransactionProcessor {
  private scanPrivkeyHex: string;
  private spendPubkeyHex: string;
  private isInitialized: boolean = false;

  constructor(seed: Buffer) {
    const scanPrivkey = getScanPrivateKey(seed);
    const spendPubkey = getSpendPublicKey(seed);
    
    this.scanPrivkeyHex = Buffer.from(scanPrivkey).toString('hex');
    this.spendPubkeyHex = Buffer.from(spendPubkey).toString('hex');
    
    this.isInitialized = initializeRustJsiBridge();
    if (!this.isInitialized) {
      console.warn('[RustTransactionProcessor] Failed to initialize JSI bridge, falling back may be required');
    }
  }

  isAvailable(): boolean {
    return this.isInitialized;
  }

  private convertToSilentPaymentUTXO(
    rustUtxo: RustMatchedUTXO,
    silentPaymentAddress: string
  ): SilentPaymentUTXO {
    return {
      txid: rustUtxo.txid,
      vout: rustUtxo.vout,
      value: rustUtxo.value,
      height: rustUtxo.height,
      address: bitcoin.payments.p2tr({
        pubkey: hexToUint8Array(rustUtxo.pubKey),
      }).address!,
      
      // sp specific fields
      silentPaymentAddress: silentPaymentAddress,
      pubKey: rustUtxo.pubKey,
      tweak: hexToUint8Array(rustUtxo.tweakHex),
      blockHash: rustUtxo.blockHash,
      isSpent: rustUtxo.isSpent,
      blockTime: rustUtxo.blockTime,
    };
  }


  process(tx: IndexerTransaction, silentPaymentAddress: string): SilentPaymentUTXO[] {
    if (!this.isInitialized) {
      throw new Error('RustTransactionProcessor not initialized');
    }

    try {
      const matchedUtxos = spScanSingleTransaction(
        this.scanPrivkeyHex,
        this.spendPubkeyHex,
        tx
      );

      return matchedUtxos.map(utxo => {
        console.log(`✓ Found matching output: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
        return this.convertToSilentPaymentUTXO(utxo, silentPaymentAddress);
      });
    } catch (error) {
      console.error(`Error processing transaction ${tx.id}:`, error);
      return [];
    }
  }


  async processBatch(
    transactions: IndexerTransaction[], 
    silentPaymentAddress: string,
    _chunkSize: number = 10, // Ignored - Rust uses optimal chunk size
    cancelScanCallback?: () => boolean
  ): Promise<SilentPaymentUTXO[]> {
    if (!this.isInitialized) {
      throw new Error('RustTransactionProcessor not initialized');
    }

    if (transactions.length === 0) {
      return [];
    }

    // Check for early cancellation
    if (cancelScanCallback?.()) {
      console.log('[RustTransactionProcessor] Processing cancelled before start');
      return [];
    }

    try {
      const RUST_BATCH_SIZE = 1000;
      const allUTXOs: SilentPaymentUTXO[] = [];

      for (let i = 0; i < transactions.length; i += RUST_BATCH_SIZE) {
        if (cancelScanCallback?.()) {
          console.log(`[RustTransactionProcessor] Processing cancelled at ${i}/${transactions.length}`);
          break;
        }

        const batch = transactions.slice(i, i + RUST_BATCH_SIZE);
        
        const result: RustBatchScanResult = spScanTransactions(
          this.scanPrivkeyHex,
          this.spendPubkeyHex,
          batch
        );

        console.log(
          `[RustTransactionProcessor] Batch ${Math.floor(i / RUST_BATCH_SIZE) + 1}: ` +
          `scanned ${result.transactionsScanned} txs, ${result.outputsScanned} outputs, ` +
          `found ${result.matchedUtxos.length} matches`
        );

        const convertedUtxos = result.matchedUtxos.map(utxo => {
          console.log(`✓ Found matching output: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
          return this.convertToSilentPaymentUTXO(utxo, silentPaymentAddress);
        });

        allUTXOs.push(...convertedUtxos);
      }

      return allUTXOs;
    } catch (error) {
      console.error('[RustTransactionProcessor] Batch processing error:', error);
      throw error;
    }
  }

  clear(): void {
    this.scanPrivkeyHex = '0'.repeat(64);
    this.spendPubkeyHex = '0'.repeat(66);
    this.scanPrivkeyHex = '';
    this.spendPubkeyHex = '';
    this.isInitialized = false;
  }
}


export function createTransactionProcessor(seed: Buffer): RustTransactionProcessor {
  const processor = new RustTransactionProcessor(seed);
  
  if (!processor.isAvailable()) {
    console.warn(
      '[createTransactionProcessor] Rust processor unavailable. ' +
      'Consider using the JavaScript TransactionProcessor as fallback.'
    );
  }
  
  return processor;
}
  