import { runOnUI, runOnJS } from 'react-native-reanimated';
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha256';
import { getScanPrivateKey, getSpendPublicKey } from './SilentPaymentKeyDerivation';
import { IndexerTransaction, SilentPaymentUTXO } from './types';
import * as bitcoin from 'bitcoinjs-lib';
import { SilentPayment } from 'silent-payments';
import * as secp256k1 from '@noble/secp256k1';
import ecc from '../../blue_modules/noble_ecc';


// ============================================================================
// Worklet-compatible utility functions
// These are inlined versions from uint8array-extras that work in worklets
// ============================================================================


const byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => 
  index.toString(16).padStart(2, "0")
);


function uint8ArrayToHex(array: Uint8Array): string {
  'worklet';
  let hexString = "";
  for (let index = 0; index < array.length; index++) {
    hexString += byteToHexLookupTable[array[index]];
  }
  return hexString;
}


const hexToDecimalLookupTable: Record<string, number> = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  a: 10, b: 11, c: 12, d: 13, e: 14, f: 15,
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15,
};


function hexToUint8Array(hexString: string): Uint8Array {
  'worklet';
  
  if (hexString.length % 2 !== 0) {
    throw new Error("Invalid Hex string length.");
  }


  const resultLength = hexString.length / 2;
  const bytes = new Uint8Array(resultLength);


  for (let index = 0; index < resultLength; index++) {
    const highNibble = hexToDecimalLookupTable[hexString[index * 2]];
    const lowNibble = hexToDecimalLookupTable[hexString[index * 2 + 1]];


    if (highNibble === undefined || lowNibble === undefined) {
      throw new Error(`Invalid Hex character at position ${index * 2}`);
    }


    bytes[index] = (highNibble << 4) | lowNibble;
  }


  return bytes;
}


function concatUint8Arrays(arrays: Uint8Array[], totalLength?: number): Uint8Array {
  'worklet';
  
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }


  totalLength ??= arrays.reduce((acc, arr) => acc + arr.length, 0);
  const returnValue = new Uint8Array(totalLength);


  let offset = 0;
  for (const array of arrays) {
    returnValue.set(array, offset);
    offset += array.length;
  }


  return returnValue;
}


// Generator point G for secp256k1
const G = hexToUint8Array("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");


function taggedHashSync(tag: "BIP0352/Inputs" | "BIP0352/SharedSecret", data: Uint8Array): Uint8Array {
  'worklet';
  
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = sha256(tagBytes);
  
  const ss = concatUint8Arrays([tagHash, tagHash, data]);
  return sha256(ss);
}


/**
 * Process a single transaction (standalone worklet function)
 */
function processSingleTx(
  tx: IndexerTransaction,
  silentPaymentAddress: string,
  scanPrivateKey: Uint8Array,
  spendPublicKey: Uint8Array
): SilentPaymentUTXO[] {
  'worklet';
  
  const matchedUTXOs: SilentPaymentUTXO[] = [];
  
  try {
    if (!tx.scanTweak || tx.scanTweak.length !== 66) {
      console.warn(`Invalid scan tweak for tx ${tx.id}: ${tx.scanTweak}`);
      return matchedUTXOs;
    }
    
    // ECDH: compute shared secret = b_scan * scanTweak
    const sharedSecret = secp256k1.getSharedSecret(
      scanPrivateKey,
      hexToUint8Array(tx.scanTweak),
      true // compressed format
    );
    
    // For now, we only support k=0 (no labels)
    const k = 0;
    const t_k = taggedHashSync(
      'BIP0352/SharedSecret',
      concatUint8Arrays([sharedSecret, SilentPayment._ser32(k)])
    );
    
    // Compute the expected output pubkey: P_k = t_k·G + B_spend
    const P_k = ecc.pointAdd(
      ecc.pointMultiply(G, t_k) as Uint8Array,
      spendPublicKey
    ) as Uint8Array;
    
    if (!P_k) {
      console.warn(`Failed to compute output pubkey for tx ${tx.id}`);
      return matchedUTXOs;
    }
    
    let expectedPubkeyHex = uint8ArrayToHex(P_k);
    if (expectedPubkeyHex.startsWith('02') || expectedPubkeyHex.startsWith('03')) {
      expectedPubkeyHex = expectedPubkeyHex.substring(2);
    }
    
    // Check each output
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error(`Error processing transaction ${tx.id}:`, errorMessage);
    console.error('Error stack:', errorStack);
    console.error('Error details:', {
      txId: tx.id,
      hasScanTweak: !!tx.scanTweak,
      scanTweakLength: tx.scanTweak?.length,
      outputsCount: tx.outputs?.length,
    });
  }
  
  return matchedUTXOs;
}


/**
 * Worklet-based transaction processor that runs heavy cryptographic operations
 * on a background thread using React Native Reanimated.
 * 
 * This processor offloads elliptic curve operations (ECDH, point multiplication, etc.)
 * to prevent blocking the JS/UI thread during silent payment scanning.
 */
export class WorkletTransactionProcessor {
  private scanPrivateKeyBuffer: Buffer;
  private spendPublicKeyBuffer: Buffer;


  constructor(seed: Buffer) {
    // Cache key buffers to avoid repeated allocations
    this.scanPrivateKeyBuffer = Buffer.from(getScanPrivateKey(seed));
    this.spendPublicKeyBuffer = Buffer.from(getSpendPublicKey(seed));
  }


  /**
   * Process transactions in a worklet batch on background thread.
   * This is the main worklet function that runs off the JS thread.
   */
  private processTransactionBatchWorklet = (
    transactions: IndexerTransaction[],
    silentPaymentAddress: string,
    scanPrivateKey: Uint8Array,
    spendPublicKey: Uint8Array,
    onBatchComplete: (utxos: SilentPaymentUTXO[]) => void,
    onProgress?: (processed: number, total: number) => void
  ) => {
    'worklet';
    
    const allUTXOs: SilentPaymentUTXO[] = [];
    
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const utxos = processSingleTx(
        tx,
        silentPaymentAddress,
        scanPrivateKey,
        spendPublicKey
      );
      
      allUTXOs.push(...utxos);
      
      // Update progress every 10 transactions or at the end
      if (onProgress && (i % 10 === 0 || i === transactions.length - 1)) {
        runOnJS(onProgress)(i + 1, transactions.length);
      }
    }
    
    // Send results back to JS thread
    runOnJS(onBatchComplete)(allUTXOs);
  };


  /**
   * Process a batch of transactions using worklets for heavy computation.
   * This method queues the work on a background thread and returns a promise.
   * 
   * @param {IndexerTransaction[]} transactions - Array of transactions to process
   * @param {string} silentPaymentAddress - The wallet's Silent Payment address
   * @param {(processed: number, total: number) => void} onProgress - Optional progress callback
   * @returns {Promise<SilentPaymentUTXO[]>} - Combined array of all matched UTXOs
   */
  async processBatchWithWorklet(
    transactions: IndexerTransaction[],
    silentPaymentAddress: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<SilentPaymentUTXO[]> {
    if (transactions.length === 0) {
      return [];
    }


    // Convert buffers to Uint8Array for worklet compatibility
    const scanPrivateKey = new Uint8Array(this.scanPrivateKeyBuffer);
    const spendPublicKey = new Uint8Array(this.spendPublicKeyBuffer);


    return new Promise((resolve, reject) => {
      try {
        const onBatchComplete = (utxos: SilentPaymentUTXO[]) => {
          resolve(utxos);
        };


        // Run on UI (background) thread
        runOnUI(this.processTransactionBatchWorklet)(
          transactions,
          silentPaymentAddress,
          scanPrivateKey,
          spendPublicKey,
          onBatchComplete,
          onProgress
        );
      } catch (error) {
        console.error('Error in worklet batch processing:', error);
        reject(error);
      }
    });
  }


  /**
   * Process transactions in chunks with worklet support.
   * Divides transactions into smaller chunks and processes each chunk on a background thread.
   * 
   * @param {IndexerTransaction[]} transactions - Array of transactions to process
   * @param {string} silentPaymentAddress - The wallet's Silent Payment address
   * @param {number} chunkSize - Number of transactions per chunk (default: 50)
   * @param {(processed: number, total: number) => void} onProgress - Optional progress callback
   * @returns {Promise<SilentPaymentUTXO[]>} - Combined array of all matched UTXOs
   */
  async processBatchInChunks(
    transactions: IndexerTransaction[],
    silentPaymentAddress: string,
    chunkSize: number = 50,
    onProgress?: (processed: number, total: number) => void
  ): Promise<SilentPaymentUTXO[]> {
    const allUTXOs: SilentPaymentUTXO[] = [];
    const totalTransactions = transactions.length;
    let processedSoFar = 0;


    // Process transactions in chunks
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      
      // Process this chunk on background thread
      const chunkUTXOs = await this.processBatchWithWorklet(
        chunk,
        silentPaymentAddress,
        (processed, total) => {
          // Translate chunk progress to overall progress
          if (onProgress) {
            onProgress(processedSoFar + processed, totalTransactions);
          }
        }
      );
      
      allUTXOs.push(...chunkUTXOs);
      processedSoFar += chunk.length;
      
      // Small delay between chunks to allow other operations
      if (i + chunkSize < transactions.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
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
