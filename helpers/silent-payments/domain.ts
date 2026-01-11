/**
 * Silent Payments Domain Types
 * 
 * These types model the core domain concepts with type safety.
 * Invalid states are made unrepresentable where possible.
 */

import { Utxo } from '../../class/wallets/types';

// ============================================================================
// Core Domain Types
// ============================================================================

/** A unique identifier for a UTXO */
export type OutPoint = `${string}:${number}`;

export function makeOutPoint(txid: string, vout: number): OutPoint {
  return `${txid}:${vout}`;
}

export function parseOutPoint(outpoint: OutPoint): { txid: string; vout: number } {
  const [txid, voutStr] = outpoint.split(':');
  return { txid, vout: parseInt(voutStr, 10) };
}

/** Keys required for Silent Payment scanning */
export interface ScanKeys {
  readonly scanPrivateKey: Uint8Array;
  readonly spendPublicKey: Uint8Array;
}

/** Keys required for Silent Payment spending */
export interface SpendKeys {
  readonly spendPrivateKey: Uint8Array;
  readonly spendPublicKey: Uint8Array;
}

// ============================================================================
// UTXO Types
// ============================================================================

/** A Silent Payment UTXO - extends base UTXO with SP-specific fields */
export interface SilentPaymentUTXO extends Utxo {
  readonly silentPaymentAddress: string;
  readonly pubKey: string;
  readonly tweak: Uint8Array;
  readonly blockHash: string;
  readonly blockTime: number;
  readonly isSpent: boolean;
}

/** For JSON serialization (Uint8Array → hex string) */
export interface SilentPaymentUTXOSerializable extends Omit<SilentPaymentUTXO, 'tweak'> {
  readonly tweakHex: string;
}

/** Type guard for Silent Payment UTXOs */
export function isSilentPaymentUTXO(utxo: Utxo): utxo is SilentPaymentUTXO {
  return 'tweak' in utxo && (utxo as any).tweak instanceof Uint8Array;
}

// ============================================================================
// Indexer Types (external API responses)
// ============================================================================

export interface IndexerOutput {
  readonly transactionId: string;
  readonly vout: number;
  readonly pubKey: string;
  readonly value: number;
  readonly isSpent: boolean | number;
}

export interface IndexerTransaction {
  readonly id: string;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly blockTime: number;
  readonly scanTweak: string;
  readonly outputs: readonly IndexerOutput[];
}

export interface LatestBlockHeightResponse {
  readonly height: number;
}

export interface TransactionResponse {
  readonly transactions: readonly IndexerTransaction[];
}

// ============================================================================
// Scan Types
// ============================================================================

/** Configuration for a scan operation */
export interface ScanConfig {
  readonly birthHeight: number;
  readonly lastScannedBlock: number;
  readonly maxBlocks: number;
}

/** The range of blocks to scan (inclusive) */
export interface BlockRange {
  readonly start: number;
  readonly end: number;
}

/** Progress of an ongoing scan */
export interface ScanProgress {
  readonly currentBlock: number;
  readonly totalBlocks: number;
  readonly blocksScanned: number;
  readonly percentComplete: number;
  readonly utxosFound: number;
}

/** Callback for scan progress updates */
export type ScanProgressCallback = (progress: ScanProgress) => void | Promise<void>;

/** Result of processing a single transaction */
export interface MatchedOutput {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
  readonly pubKey: string;
  readonly tweak: Uint8Array;
  readonly blockHeight: number;
  readonly blockHash: string;
  readonly blockTime: number;
}

// ============================================================================
// Result Types (Railway-Oriented Programming)
// ============================================================================

/** Success or failure with typed errors */
export type Result<T, E> = 
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Create a success result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Create a failure result */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Map over a successful result */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Chain results (flatMap) */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

// ============================================================================
// Scan Error Types
// ============================================================================

export type ScanError =
  | { readonly type: 'CANCELLED' }
  | { readonly type: 'INDEXER_NOT_INITIALIZED' }
  | { readonly type: 'INVALID_BLOCK_HEIGHT'; readonly height: number }
  | { readonly type: 'INDEXER_ERROR'; readonly message: string }
  | { readonly type: 'ALREADY_UP_TO_DATE' };

export function scanErrorMessage(error: ScanError): string {
  switch (error.type) {
    case 'CANCELLED':
      return 'Scan was cancelled';
    case 'INDEXER_NOT_INITIALIZED':
      return 'Silent Payment Indexer not initialized';
    case 'INVALID_BLOCK_HEIGHT':
      return `Invalid block height: ${error.height}`;
    case 'INDEXER_ERROR':
      return `Indexer error: ${error.message}`;
    case 'ALREADY_UP_TO_DATE':
      return 'Wallet is already up to date';
  }
}

// ============================================================================
// Spend Error Types
// ============================================================================

export type SpendError =
  | { readonly type: 'NO_UTXOS' }
  | { readonly type: 'INSUFFICIENT_FUNDS'; readonly required: number; readonly available: number }
  | { readonly type: 'NO_TARGETS' }
  | { readonly type: 'UTXO_NOT_FOUND'; readonly outpoint: OutPoint }
  | { readonly type: 'SIGNING_FAILED'; readonly message: string }
  | { readonly type: 'BROADCAST_FAILED'; readonly message: string };

export function spendErrorMessage(error: SpendError): string {
  switch (error.type) {
    case 'NO_UTXOS':
      return 'No UTXOs provided';
    case 'INSUFFICIENT_FUNDS':
      return `Insufficient funds: need ${error.required}, have ${error.available}`;
    case 'NO_TARGETS':
      return 'No destination provided';
    case 'UTXO_NOT_FOUND':
      return `UTXO not found: ${error.outpoint}`;
    case 'SIGNING_FAILED':
      return `Signing failed: ${error.message}`;
    case 'BROADCAST_FAILED':
      return `Broadcast failed: ${error.message}`;
  }
}

// ============================================================================
// Indexer Config
// ============================================================================

export interface SilentPaymentIndexerConfig {
  readonly baseUrl: string;
  readonly timeout?: number;
}

export interface HealthResponse {
  readonly status: string;
  readonly message?: string;
}
