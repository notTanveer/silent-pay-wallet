import { scanOutputsWithTweak } from '@silent-pay/core';
import { Buffer } from 'buffer';
import { getScanPrivateKey, getSpendPublicKey } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';
import { hexToUint8Array } from '../../blue_modules/uint8array-extras';
import * as bitcoin from 'bitcoinjs-lib';


export class TransactionProcessor {
  private scanPrivateKeyBuffer: Buffer;
  private spendPublicKeyBuffer: Buffer;

  constructor(seed: Buffer) {
    // Cache key buffers to avoid repeated allocations
    this.scanPrivateKeyBuffer = Buffer.from(getScanPrivateKey(seed));
    this.spendPublicKeyBuffer = Buffer.from(getSpendPublicKey(seed));
  }

  /**
   * Process a transaction and find matching outputs.
   * 
   * 1. computes ECDH shared secret: b_scan * scanTweak
   * 2. derives tweaks using BIP-352/SharedSecret tagged hash
   * 3. checks if any outputs match: P = B_spend + tweak*G
   * 
   * @param {IndexerTransaction} tx - transaction data from indexer
   * @param {string} silentPaymentAddress - The wallet's Silent Payment address for the UTXO
   * @returns {SilentPaymentUTXO[]} - array of matched UTXOs
   */
  process(tx: IndexerTransaction, silentPaymentAddress: string): SilentPaymentUTXO[] {
    const matchedUTXOs: SilentPaymentUTXO[] = [];
    
    try {
      const scanTweak = Buffer.from(tx.scanTweak, 'hex');
      
      if (scanTweak.length !== 33) {
        console.warn(`Invalid scan tweak length for tx ${tx.id}: ${scanTweak.length} bytes`);
        return matchedUTXOs;
      }
      
      const outputPubKeys = tx.outputs.map(output => 
        hexToUint8Array('02' + output.pubKey)
      );
      
      const matchedOutputs = scanOutputsWithTweak(
        this.scanPrivateKeyBuffer,
        this.spendPublicKeyBuffer,
        scanTweak,
        outputPubKeys,
      );
      
      if (matchedOutputs.size === 0) {
        return matchedUTXOs;
      }
      
      for (const [outputPubKeyHex, tweakBuffer] of matchedOutputs.entries()) {
        const xOnlyPubKey = outputPubKeyHex.slice(2); // Remove 0x02 prefix
        const outputMap = new Map(tx.outputs.map(o => [o.pubKey, o]));
        const output = outputMap.get(xOnlyPubKey);
        
        if (output) {
          console.log(`✓ Found matching output: ${tx.id}:${output.vout} (${output.value} sats)`);
          
          matchedUTXOs.push({
            txid: tx.id,
            vout: output.vout,
            value: output.value,
            height: tx.blockHeight,
            address: bitcoin.payments.p2tr({
              pubkey: hexToUint8Array(xOnlyPubKey),
            }).address!,

            // Silent Payment specific fields
            silentPaymentAddress: silentPaymentAddress,
            pubKey: output.pubKey,
            tweak: new Uint8Array(tweakBuffer),
            blockHash: tx.blockHash,
            isSpent: Boolean(output.isSpent),
            blockTime: tx.blockTime,
          });
        }
      }
      
    } catch (error) {
      console.error(`Error processing transaction ${tx.id}:`, error);
    }
    
    return matchedUTXOs;
  }

  /**
   * Process multiple transactions with chunked processing for better UI responsiveness.
   * Processes transactions in small chunks and yields to the event loop between chunks.
   * 
   * @param {IndexerTransaction[]} transactions - Array of transactions to process
   * @param {string} silentPaymentAddress - The wallet's Silent Payment address
   * @param {number} chunkSize - Number of transactions to process before yielding (default: 10)
   * @param {() => boolean} cancelScanCallback - Optional callback to check if processing should be cancelled
   * @returns {Promise<SilentPaymentUTXO[]>} - Combined array of all matched UTXOs
   */
  async processBatch(
    transactions: IndexerTransaction[], 
    silentPaymentAddress: string,
    chunkSize: number = 10,
    cancelScanCallback?: () => boolean
  ): Promise<SilentPaymentUTXO[]> {
    const allUTXOs: SilentPaymentUTXO[] = [];
    
    // process transactions in chunks to avoid blocking the UI thread
    for (let i = 0; i < transactions.length; i += chunkSize) {
      if (cancelScanCallback?.()) {
        console.log(`[TransactionProcessor] Processing cancelled at transaction ${i}/${transactions.length}`);
        break;
      }
      
      const chunk = transactions.slice(i, i + chunkSize);
      
      const chunkResults = chunk.map(tx => this.process(tx, silentPaymentAddress));
      allUTXOs.push(...chunkResults.flat());
      
      // yield to event loop after each chunk (except the last one)
      if (i + chunkSize < transactions.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    return allUTXOs;
  }

  clear(): void {
    this.scanPrivateKeyBuffer.fill(0);
    this.spendPublicKeyBuffer.fill(0);
    this.scanPrivateKeyBuffer = null as any;
    this.spendPublicKeyBuffer = null as any;
  }
}
