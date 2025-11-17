import { Buffer } from 'buffer';
import * as crypto from "crypto";
import { getScanPrivateKey, getSpendPublicKey } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';
import { hexToUint8Array, uint8ArrayToHex, concatUint8Arrays } from '../../blue_modules/uint8array-extras';
import * as bitcoin from 'bitcoinjs-lib';
import { SilentPayment } from 'silent-payments';
import * as secp256k1 from '@noble/secp256k1';
import ecc from '../../blue_modules/noble_ecc';

const G = hexToUint8Array("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");

export class TransactionProcessor {
  private scanPrivateKeyBuffer: Buffer;
  private spendPublicKeyBuffer: Buffer;

  constructor(seed: Buffer) {
    // Cache key buffers to avoid repeated allocations
    this.scanPrivateKeyBuffer = Buffer.from(getScanPrivateKey(seed));
    this.spendPublicKeyBuffer = Buffer.from(getSpendPublicKey(seed));
  }

  static taggedHash(tag: "BIP0352/Inputs" | "BIP0352/SharedSecret", data: Uint8Array): Uint8Array {
    const hash = crypto.createHash("sha256");
    const tagHash = new Uint8Array(hash.update(tag, "utf-8").digest());
    const ss = concatUint8Arrays([tagHash, tagHash, data]);
    return new Uint8Array(crypto.createHash("sha256").update(ss).digest());
  }

  /**
   * Process a transaction and find matching outputs.
   * 
   * Uses the same algorithm as SilentPayment.detectOurUtxos but adapted for
   * pre-computed tweaks from an indexer backend.
   * 
   * 1. computes ECDH shared secret: b_scan * scanTweak
   * 2. derives output tweaks using BIP-352/SharedSecret tagged hash
   * 3. checks if any outputs match: P = B_spend + tweak*G
   * 
   * @param {IndexerTransaction} tx - transaction data from indexer with pre-computed scanTweak
   * @param {string} silentPaymentAddress - The wallet's Silent Payment address for the UTXO
   * @returns {SilentPaymentUTXO[]} - array of matched UTXOs
   */
  process(tx: IndexerTransaction, silentPaymentAddress: string): SilentPaymentUTXO[] {
    const matchedUTXOs: SilentPaymentUTXO[] = [];
    
    try {
      if (!tx.scanTweak || tx.scanTweak.length !== 66) {
        console.warn(`Invalid scan tweak for tx ${tx.id}: ${tx.scanTweak}`);
        return matchedUTXOs;
      }
      
      const sharedSecret = secp256k1.getSharedSecret(
        this.scanPrivateKeyBuffer,
        hexToUint8Array(tx.scanTweak),
        true // compressed format
      );
      
      // for now, we only support k=0 (no labels)
      const k = 0;
      const t_k = TransactionProcessor.taggedHash(
        'BIP0352/SharedSecret',
        concatUint8Arrays([sharedSecret, SilentPayment._ser32(k)])
      );
      
      // compute the expected output pubkey: P_k = t_k·G + B_spend
      const P_k = ecc.pointAdd(
        ecc.pointMultiply(G, t_k) as Uint8Array,
        this.spendPublicKeyBuffer
      ) as Uint8Array;
      
      if (!P_k) {
        console.warn(`Failed to compute output pubkey for tx ${tx.id}`);
        return matchedUTXOs;
      }
      
      let expectedPubkeyHex = uint8ArrayToHex(P_k);
      if (expectedPubkeyHex.startsWith('02') || expectedPubkeyHex.startsWith('03')) {
        expectedPubkeyHex = expectedPubkeyHex.substring(2);
      }
      
      for (const output of tx.outputs) {
        if (output.pubKey === expectedPubkeyHex) {
          console.log(`✓ Found matching output: ${tx.id}:${output.vout} (${output.value} sats)`);
          
          matchedUTXOs.push({
            txid: tx.id,
            vout: output.vout,
            value: output.value,
            height: tx.blockHeight,
            address: bitcoin.payments.p2tr({
              pubkey: hexToUint8Array(expectedPubkeyHex),
            }).address!,

            // Silent Payment specific fields
            silentPaymentAddress: silentPaymentAddress,
            pubKey: output.pubKey,
            tweak: t_k,
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
   * @returns {Promise<SilentPaymentUTXO[]>} - Combined array of all matched UTXOs
   */
  async processBatch(
    transactions: IndexerTransaction[], 
    silentPaymentAddress: string,
    chunkSize: number = 10
  ): Promise<SilentPaymentUTXO[]> {
    const allUTXOs: SilentPaymentUTXO[] = [];
    
    // process transactions in chunks to avoid blocking the UI thread
    for (let i = 0; i < transactions.length; i += chunkSize) {
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
