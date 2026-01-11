/**
 * Silent Payment Scanning - Pure Functions
 * 
 * This module contains all scanning logic as pure, composable functions.
 * No classes, no mutable state, no side effects (except where explicitly noted).
 * 
 * The flow is linear and obvious:
 *   1. Calculate block range to scan
 *   2. Fetch transactions from indexer
 *   3. Find matching outputs (ECDH magic)
 *   4. Return new UTXOs
 */

import { scanOutputsWithTweak } from '@silent-pay/core';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { hexToUint8Array } from '../../blue_modules/uint8array-extras';
import {
  BlockRange,
  IndexerTransaction,
  MatchedOutput,
  ScanConfig,
  ScanError,
  ScanKeys,
  SilentPaymentUTXO,
  Result,
  ok,
  err,
} from './domain';

// ============================================================================
// Constants
// ============================================================================

const TAPROOT_ACTIVATION_HEIGHT = 927101;
const SCAN_TWEAK_LENGTH = 33;

// ============================================================================
// Block Range Calculation
// ============================================================================

/**
 * Calculate the range of blocks to scan.
 * 
 * Returns null if already up to date, otherwise returns inclusive [start, end].
 * 
 * @pure
 */
export function calculateBlockRange(
  config: ScanConfig,
  latestBlock: number,
): Result<BlockRange, ScanError> {
  if (latestBlock <= 0) {
    return err({ type: 'INVALID_BLOCK_HEIGHT', height: latestBlock });
  }

  const effectiveBirthHeight = Math.max(config.birthHeight, TAPROOT_ACTIVATION_HEIGHT);

  // Incremental scan: continue from where we left off
  if (config.lastScannedBlock > 0) {
    const start = config.lastScannedBlock + 1;
    
    if (start > latestBlock) {
      return err({ type: 'ALREADY_UP_TO_DATE' });
    }

    const blocksToScan = latestBlock - config.lastScannedBlock;
    const end = blocksToScan > config.maxBlocks 
      ? config.lastScannedBlock + config.maxBlocks 
      : latestBlock;

    return ok({ start, end });
  }

  // Full scan: start from birth height
  const start = effectiveBirthHeight;
  const totalBlocks = latestBlock - effectiveBirthHeight + 1;
  const end = totalBlocks > config.maxBlocks 
    ? start + config.maxBlocks - 1 
    : latestBlock;

  if (start > end) {
    return err({ type: 'ALREADY_UP_TO_DATE' });
  }

  return ok({ start, end });
}

// ============================================================================
// Transaction Scanning (The Core Algorithm)
// ============================================================================

/**
 * Check if a transaction contains outputs for our silent payment address.
 * 
 * This is the core BIP-352 scanning algorithm:
 *   1. Compute ECDH shared secret: b_scan * scanTweak
 *   2. Derive output tweaks using BIP-352 tagged hash
 *   3. Check if any output matches: P = B_spend + tweak*G
 * 
 * @pure
 */
export function findMatchingOutputs(
  tx: IndexerTransaction,
  keys: ScanKeys,
): MatchedOutput[] {
  // Validate scan tweak
  const scanTweak = Buffer.from(tx.scanTweak, 'hex');
  if (scanTweak.length !== SCAN_TWEAK_LENGTH) {
    console.warn(`[scan] Invalid scan tweak length for tx ${tx.id}: ${scanTweak.length} bytes`);
    return [];
  }

  // Convert output pubkeys to the format expected by the library (add 02 prefix)
  const outputPubKeys = tx.outputs.map(output => hexToUint8Array('02' + output.pubKey));

  // The magic: ECDH + BIP-352 derivation
  const matchedOutputs = scanOutputsWithTweak(
    Buffer.from(keys.scanPrivateKey),
    Buffer.from(keys.spendPublicKey),
    scanTweak,
    outputPubKeys,
  );

  if (matchedOutputs.size === 0) {
    return [];
  }

  // Convert matches to our domain type
  const results: MatchedOutput[] = [];
  const outputsByPubKey = new Map(tx.outputs.map(o => [o.pubKey, o]));

  for (const [outputPubKeyHex, tweakBuffer] of matchedOutputs.entries()) {
    const xOnlyPubKey = outputPubKeyHex.slice(2); // Remove 0x02 prefix
    const output = outputsByPubKey.get(xOnlyPubKey);

    if (output) {
      results.push({
        txid: tx.id,
        vout: output.vout,
        value: output.value,
        pubKey: output.pubKey,
        tweak: new Uint8Array(tweakBuffer),
        blockHeight: tx.blockHeight,
        blockHash: tx.blockHash,
        blockTime: tx.blockTime,
      });
    }
  }

  return results;
}

/**
 * Scan a batch of transactions and find all matching outputs.
 * 
 * @pure
 */
export function scanTransactions(
  transactions: IndexerTransaction[],
  keys: ScanKeys,
): MatchedOutput[] {
  // Filter valid transactions upfront
  const validTransactions = transactions.filter(
    tx => tx.scanTweak && tx.outputs && tx.outputs.length > 0
  );

  // Process all transactions and flatten results
  return validTransactions.flatMap(tx => findMatchingOutputs(tx, keys));
}

// ============================================================================
// UTXO Construction
// ============================================================================

/**
 * Convert a matched output to a full SilentPaymentUTXO.
 * 
 * @pure
 */
export function matchedOutputToUTXO(
  match: MatchedOutput,
  silentPaymentAddress: string,
): SilentPaymentUTXO {
  const address = bitcoin.payments.p2tr({
    pubkey: hexToUint8Array(match.pubKey),
  }).address!;

  return {
    txid: match.txid,
    vout: match.vout,
    value: match.value,
    height: match.blockHeight,
    address,
    silentPaymentAddress,
    pubKey: match.pubKey,
    tweak: match.tweak,
    blockHash: match.blockHash,
    blockTime: match.blockTime,
    isSpent: false,
  };
}

/**
 * Convert all matched outputs to UTXOs.
 * 
 * @pure
 */
export function matchedOutputsToUTXOs(
  matches: MatchedOutput[],
  silentPaymentAddress: string,
): SilentPaymentUTXO[] {
  return matches.map(match => matchedOutputToUTXO(match, silentPaymentAddress));
}

// ============================================================================
// Full Scan Pipeline (Composition)
// ============================================================================

/**
 * Process a block's transactions and return new UTXOs.
 * 
 * This is the main entry point for scanning a single block.
 * Composes the pure functions above into a complete pipeline.
 * 
 * @pure
 */
export function processBlock(
  transactions: IndexerTransaction[],
  keys: ScanKeys,
  silentPaymentAddress: string,
): SilentPaymentUTXO[] {
  const matches = scanTransactions(transactions, keys);
  
  if (matches.length > 0) {
    console.log(`[scan] Found ${matches.length} matching output(s)`);
    matches.forEach(m => console.log(`  ✓ ${m.txid}:${m.vout} (${m.value} sats)`));
  }

  return matchedOutputsToUTXOs(matches, silentPaymentAddress);
}

// ============================================================================
// UTXO Deduplication
// ============================================================================

/**
 * Merge new UTXOs with existing ones, avoiding duplicates.
 * 
 * @pure - returns a new array, doesn't mutate inputs
 */
export function mergeUTXOs(
  existing: readonly SilentPaymentUTXO[],
  newUtxos: readonly SilentPaymentUTXO[],
): { utxos: SilentPaymentUTXO[]; addedCount: number } {
  const existingKeys = new Set(existing.map(u => `${u.txid}:${u.vout}`));
  const toAdd = newUtxos.filter(u => !existingKeys.has(`${u.txid}:${u.vout}`));
  
  return {
    utxos: [...existing, ...toAdd],
    addedCount: toAdd.length,
  };
}

// ============================================================================
// Cancellation Support
// ============================================================================

/**
 * A simple cancellation token for async operations.
 * 
 * Usage:
 *   const cancel = createCancellationToken();
 *   // In scan loop: if (cancel.isCancelled()) return;
 *   // To cancel: cancel.cancel();
 */
export interface CancellationToken {
  isCancelled: () => boolean;
  cancel: () => void;
}

export function createCancellationToken(): CancellationToken {
  let cancelled = false;
  return {
    isCancelled: () => cancelled,
    cancel: () => { cancelled = true; },
  };
}
