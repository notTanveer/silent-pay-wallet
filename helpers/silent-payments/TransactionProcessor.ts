import { scanOutputsWithTweak } from '@silent-pay/core';
import { Buffer } from 'buffer';
import { SilentPaymentKeyDerivation } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';


export class TransactionProcessor {
  private scanPrivateKeyBuffer: Buffer;
  private spendPublicKeyBuffer: Buffer;

  constructor(private keyDerivation: SilentPaymentKeyDerivation) {
    // Cache key buffers to avoid repeated allocations
    this.scanPrivateKeyBuffer = Buffer.from(this.keyDerivation.getScanPrivateKey());
    this.spendPublicKeyBuffer = Buffer.from(this.keyDerivation.getSpendPublicKey());
  }

  /**
   * 
   * 1. computes ECDH shared secret: b_scan * scanTweak
   * 2. derives tweaks using BIP-352/SharedSecret tagged hash
   * 3. checks if any outputs match: P = B_spend + tweak*G
   * 
   * @param {IndexerTransaction} tx - transaction data from indexer
   * @returns {SilentPaymentUTXO[]} - array of matched UTXOs
   */
  process(tx: IndexerTransaction): SilentPaymentUTXO[] {
    const matchedUTXOs: SilentPaymentUTXO[] = [];
    
    try {
      const scanTweak = Buffer.from(tx.scanTweak, 'hex');
      
      if (scanTweak.length !== 33) {
        console.warn(`Invalid scan tweak length for tx ${tx.txid}: ${scanTweak.length} bytes`);
        return matchedUTXOs;
      }
      
      const outputPubKeys = tx.outputs.map(output => 
        Buffer.from('02' + output.pubKey, 'hex')
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
            timestamp: Math.floor(Date.now() / 1000), // FIXME: use current time as placeholder, for now
          });
        }
      }
      
    } catch (error) {
      console.error(`Error processing transaction ${tx.txid}:`, error);
    }
    
    return matchedUTXOs;
  }
}
