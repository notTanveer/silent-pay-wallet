/**
 * Silent Payment Spending - Pure Functions
 * 
 * This module contains all spending logic as pure, composable functions.
 * The PSBT building and signing is isolated from state management.
 * 
 * The flow is linear:
 *   1. Validate inputs and targets
 *   2. Build PSBT with tweaked taproot inputs
 *   3. Sign with tweaked private keys
 *   4. Return signed transaction
 */

import { Buffer } from 'buffer';
import { ECPairFactory } from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '../../blue_modules/noble_ecc';
import {
  SilentPaymentUTXO,
  SpendKeys,
  SpendError,
  Result,
  OutPoint,
  makeOutPoint,
  ok,
  err,
} from './domain';

const ECPair = ECPairFactory(ecc);

// ============================================================================
// Types
// ============================================================================

export interface SpendTarget {
  readonly address: string;
  readonly value: number;
}

export interface CoinSelectResult {
  readonly inputs: readonly SilentPaymentUTXO[];
  readonly outputs: readonly SpendTarget[];
  readonly fee: number;
}

export interface UnsignedTransaction {
  readonly psbt: bitcoin.Psbt;
  readonly inputs: readonly SilentPaymentUTXO[];
  readonly outputs: readonly SpendTarget[];
  readonly fee: number;
}

export interface SignedTransaction {
  readonly tx: bitcoin.Transaction;
  readonly psbt: bitcoin.Psbt;
  readonly inputs: readonly SilentPaymentUTXO[];
  readonly outputs: readonly SpendTarget[];
  readonly fee: number;
  readonly txid: string;
  readonly hex: string;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate spending inputs before building transaction.
 * 
 * @pure
 */
export function validateSpendInputs(
  utxos: readonly SilentPaymentUTXO[],
  targets: readonly SpendTarget[],
): Result<void, SpendError> {
  if (utxos.length === 0) {
    return err({ type: 'NO_UTXOS' });
  }

  if (targets.length === 0) {
    return err({ type: 'NO_TARGETS' });
  }

  const available = utxos.reduce((sum, u) => sum + u.value, 0);
  const required = targets.reduce((sum, t) => sum + t.value, 0);

  // Note: This is a basic check. Actual fee calculation happens in coinselect.
  if (available < required) {
    return err({ type: 'INSUFFICIENT_FUNDS', required, available });
  }

  return ok(undefined);
}

// ============================================================================
// PSBT Building
// ============================================================================

/**
 * Compute the tweaked x-only public key for a Silent Payment output.
 * 
 * The output's public key = B_spend + tweak*G (where tweak is derived from ECDH)
 * 
 * @pure
 */
export function computeTweakedPubKey(
  spendPubKey: Uint8Array,
  tweak: Uint8Array,
): Uint8Array | null {
  const xOnlyPub = spendPubKey.subarray(1, 33);
  const result = ecc.xOnlyPointAddTweak(xOnlyPub, tweak);
  return result?.xOnlyPubkey ?? null;
}

/**
 * Build a Taproot witness script for an x-only public key.
 * 
 * Format: OP_1 (0x51) + PUSH32 (0x20) + pubkey
 * 
 * @pure
 */
export function buildTaprootWitnessScript(xOnlyPubKey: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from([0x51, 0x20]), // OP_1 + PUSH32
    xOnlyPubKey,
  ]);
}

/**
 * Build an unsigned PSBT from Silent Payment UTXOs.
 * 
 * @pure
 */
export function buildUnsignedPSBT(
  inputs: readonly SilentPaymentUTXO[],
  outputs: readonly SpendTarget[],
  keys: SpendKeys,
  sequence: number = 0xfffffffd,
): Result<bitcoin.Psbt, SpendError> {
  const psbt = new bitcoin.Psbt();
  const xOnlyPub = keys.spendPublicKey.subarray(1, 33);

  // Add inputs
  for (const input of inputs) {
    const tweakedPubKey = computeTweakedPubKey(keys.spendPublicKey, input.tweak);
    if (!tweakedPubKey) {
      return err({
        type: 'SIGNING_FAILED',
        message: `Failed to compute tweaked key for ${input.txid}:${input.vout}`,
      });
    }

    const witnessScript = buildTaprootWitnessScript(tweakedPubKey);

    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      sequence,
      witnessUtxo: {
        script: witnessScript,
        value: BigInt(input.value),
      },
      tapInternalKey: Buffer.from(xOnlyPub),
    });
  }

  // Add outputs
  for (const output of outputs) {
    psbt.addOutput({
      address: output.address,
      value: BigInt(output.value),
    });
  }

  return ok(psbt);
}

// ============================================================================
// Signing
// ============================================================================

/**
 * Compute the tweaked private key for signing.
 * 
 * tweaked_privkey = spend_privkey + tweak (mod n)
 * 
 * @pure
 */
export function computeTweakedPrivKey(
  spendPrivKey: Uint8Array,
  tweak: Uint8Array,
): Uint8Array | null {
  return ecc.privateAdd(spendPrivKey, tweak) ?? null;
}

/**
 * Sign a PSBT with Silent Payment tweaked keys.
 * 
 * Each input requires its own tweaked private key derived from the UTXO's tweak.
 * 
 * @impure - mutates the PSBT
 */
export function signPSBT(
  psbt: bitcoin.Psbt,
  inputs: readonly SilentPaymentUTXO[],
  keys: SpendKeys,
): Result<bitcoin.Transaction, SpendError> {
  // Sign each input
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const tweakedPrivKey = computeTweakedPrivKey(keys.spendPrivateKey, input.tweak);

    if (!tweakedPrivKey) {
      return err({
        type: 'SIGNING_FAILED',
        message: `Failed to compute tweaked private key for input ${i}`,
      });
    }

    const keyPair = ECPair.fromPrivateKey(Buffer.from(tweakedPrivKey), { compressed: true });
    psbt.signTaprootInput(i, keyPair);
  }

  // Finalize
  psbt.finalizeAllInputs();

  return ok(psbt.extractTransaction());
}

// ============================================================================
// Full Spending Pipeline
// ============================================================================

/**
 * Create a signed Silent Payment transaction.
 * 
 * This is the main entry point for spending SP UTXOs.
 * 
 * @param coinSelectResult - Output from coin selection (inputs, outputs, fee)
 * @param keys - Spending keys
 * @param sequence - Transaction sequence number (for RBF)
 */
export function createSignedTransaction(
  coinSelectResult: CoinSelectResult,
  keys: SpendKeys,
): Result<SignedTransaction, SpendError> {
  const { inputs, outputs, fee } = coinSelectResult;

  // Build unsigned PSBT
  const psbtResult = buildUnsignedPSBT(inputs, outputs, keys);
  if (!psbtResult.ok) {
    return psbtResult;
  }

  // Sign
  const txResult = signPSBT(psbtResult.value, inputs, keys);
  if (!txResult.ok) {
    return txResult;
  }

  const tx = txResult.value;
  
  return ok({
    tx,
    psbt: psbtResult.value,
    inputs,
    outputs,
    fee,
    txid: tx.getId(),
    hex: tx.toHex(),
  });
}

/**
 * Create an unsigned transaction (for external signing/verification).
 */
export function createUnsignedTransaction(
  coinSelectResult: CoinSelectResult,
  keys: SpendKeys,
): Result<UnsignedTransaction, SpendError> {
  const { inputs, outputs, fee } = coinSelectResult;

  const psbtResult = buildUnsignedPSBT(inputs, outputs, keys);
  if (!psbtResult.ok) {
    return psbtResult;
  }

  return ok({
    psbt: psbtResult.value,
    inputs,
    outputs,
    fee,
  });
}

// ============================================================================
// Post-Broadcast Helpers
// ============================================================================

/**
 * Extract the inputs from a raw transaction hex.
 * 
 * @pure
 */
export function extractInputsFromHex(hex: string): OutPoint[] {
  const tx = bitcoin.Transaction.fromHex(hex);
  return tx.ins.map(input => {
    const txid = Buffer.from(input.hash).reverse().toString('hex');
    return makeOutPoint(txid, input.index);
  });
}

/**
 * Calculate the net value change from a transaction.
 * 
 * Negative = money left the wallet
 * Positive = money entered the wallet (shouldn't happen for spending)
 * 
 * @param spentUtxos - The UTXOs that were spent
 * @param tx - The transaction
 * @param isOurAddress - Function to check if an address belongs to us
 * 
 * @pure
 */
export function calculateNetValueChange(
  spentUtxos: readonly SilentPaymentUTXO[],
  tx: bitcoin.Transaction,
  isOurAddress: (address: string) => boolean,
): number {
  // Start with money leaving (inputs)
  let value = -spentUtxos.reduce((sum, u) => sum + u.value, 0);

  // Add back money returning (change outputs)
  for (const output of tx.outs) {
    try {
      const address = bitcoin.address.fromOutputScript(output.script, bitcoin.networks.bitcoin);
      if (isOurAddress(address)) {
        value += Number(output.value);
      }
    } catch {
      // Can't decode address - not ours
    }
  }

  return value;
}
