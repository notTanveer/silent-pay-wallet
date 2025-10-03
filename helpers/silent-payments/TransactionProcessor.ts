import { scanOutputsWithTweak } from '@silent-pay/core';
import { Buffer } from 'buffer';
import { SilentPaymentKeyDerivation } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';

/**
 * TransactionProcessor
 * 
 * Single Responsibility: Process transactions to find matching Silent Payment outputs
 * Strategy Pattern: Encapsulates the transaction scanning algorithm
 * 
 * Handles:
 * - Scanning transaction outputs for matches
 * - Using @silent-pay/core to perform ECDH and tweak derivation
 * - Validating scan tweaks
 */
export class TransactionProcessor {
  constructor(private keyDerivation: SilentPaymentKeyDerivation) {}

  /**
   * Process a single transaction from the indexer using @silent-pay/core.
   * 
   * Uses the scanOutputsWithTweak function from @silent-pay/core which:
   * 1. Computes ECDH shared secret: b_scan * scanTweak
   * 2. Derives tweaks using BIP-352/SharedSecret tagged hash
   * 3. Checks if any outputs match: P = B_spend + tweak*G
   * 
   * @param {IndexerTransaction} tx - Transaction data from indexer
   * @returns {SilentPaymentUTXO[]} - Array of matched UTXOs (may be empty)
   */
  process(tx: IndexerTransaction): SilentPaymentUTXO[] {
    const matchedUTXOs: SilentPaymentUTXO[] = [];
    
    try {
      const scanPrivateKey = Buffer.from(this.keyDerivation.getScanPrivateKey());
      const spendPublicKey = Buffer.from(this.keyDerivation.getSpendPublicKey());
      const scanTweak = Buffer.from(tx.scanTweak, 'hex');
      
      if (scanTweak.length !== 33) {
        console.warn(`Invalid scan tweak length for tx ${tx.txid}: ${scanTweak.length} bytes`);
        return matchedUTXOs;
      }
      
      const outputPubKeys = tx.outputs.map(output => 
        Buffer.from('02' + output.pubKey, 'hex')
      );
      
      const matchedOutputs = scanOutputsWithTweak(
        scanPrivateKey,
        spendPublicKey,
        scanTweak,
        outputPubKeys,
      );
      
      if (matchedOutputs.size === 0) {
        return matchedUTXOs;
      }
      
      for (const [outputPubKeyHex, tweakBuffer] of matchedOutputs.entries()) {
        const xOnlyPubKey = outputPubKeyHex.slice(2); // Remove 0x02 prefix
        const output = tx.outputs.find(o => o.pubKey === xOnlyPubKey);
        
        if (output) {
          console.log(`✓ Found matching output: ${tx.txid}:${output.vout} (${output.value} sats)`);
          
          matchedUTXOs.push({
            txid: tx.txid,
            vout: output.vout,
            value: output.value,
            pubKey: output.pubKey,
            blockHeight: tx.blockHeight,
            blockHash: tx.blockHash,
            tweak: new Uint8Array(tweakBuffer),
            isSpent: output.isSpent,
          });
        }
      }
      
    } catch (error) {
      console.error(`Error processing transaction ${tx.txid}:`, error);
    }
    
    return matchedUTXOs;
  }
}
