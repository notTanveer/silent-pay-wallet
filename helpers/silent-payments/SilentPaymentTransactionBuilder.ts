import * as bitcoin from 'bitcoinjs-lib';
import { SilentPayment, UTXO as SPUTXO, UTXOType, Target } from 'silent-payments';
import { SilentPaymentUTXO } from './types';
import { SilentPaymentSpender } from './SilentPaymentSpender';
import { Buffer } from 'buffer';
import { ECPairFactory } from 'ecpair';
import ecc from '../../blue_modules/noble_ecc';

const ECPair = ECPairFactory(ecc);

/**
 * Enhanced transaction builder that combines:
 * - BlueWallet Silent Payments library for sending TO Silent Payment addresses
 * - @silent-pay/core pattern for spending FROM Silent Payment UTXOs
 * 
 * This provides a complete solution for both receiving and spending Silent Payments.
 */
export class SilentPaymentTransactionBuilder {
  private spendPrivKey: Uint8Array;
  private spendPubKey: Uint8Array;

  constructor(spendPrivKey: Uint8Array, spendPubKey: Uint8Array) {
    this.spendPrivKey = spendPrivKey;
    this.spendPubKey = spendPubKey;
  }

  /**
   * Converts Silent Payment UTXO to the format expected by BlueWallet's library
   * This is useful when spending SP UTXOs to create new transactions
   */
  private convertToBlueWalletUTXO(utxo: SilentPaymentUTXO): SPUTXO {
    // Create tweaked keypair for this UTXO
    const tweakedKeyPair = SilentPaymentSpender.createTweakedKeyPair(
      this.spendPrivKey,
      utxo.tweak
    );

    return {
      txid: utxo.txid,
      vout: utxo.vout,
      wif: tweakedKeyPair.toWIF(), // WIF of the tweaked private key
      utxoType: 'p2tr' as UTXOType, // Silent Payments are always Taproot
    };
  }

  /**
   * Creates a transaction that can:
   * 1. Spend from Silent Payment UTXOs (using tweaked keys)
   * 2. Send to Silent Payment addresses (using BlueWallet library)
   * 3. Send to regular Bitcoin addresses
   * 
   * @param spUtxos - Silent Payment UTXOs to spend
   * @param targets - Array of outputs (can be SP addresses or regular addresses)
   * @returns Processed targets with SP addresses converted to Taproot addresses
   */
  buildTransaction(
    spUtxos: SilentPaymentUTXO[],
    targets: { address: string; value?: number }[]
  ): Target[] {
    // Convert our SP UTXOs to BlueWallet format
    const bluewalletUtxos = spUtxos.map(utxo => this.convertToBlueWalletUTXO(utxo));

    // Use BlueWallet's library to process targets
    // This will convert any SP addresses to actual Taproot addresses
    const sp = new SilentPayment();
    const processedTargets = sp.createTransaction(bluewalletUtxos, targets);

    return processedTargets;
  }

  /**
   * Creates a complete PSBT for spending SP UTXOs
   * This combines both libraries for a complete solution:
   * - BlueWallet library for target address processing
   * - @silent-pay/core pattern for input signing
   * 
   * @param spUtxos - Silent Payment UTXOs to spend
   * @param targets - Output targets (SP addresses will be converted)
   * @param feeRate - Fee rate in sat/vByte
   * @param changeAddress - Change address (can be SP address)
   * @param sequence - RBF sequence number
   * @returns Complete PSBT ready for broadcasting
   */
  createCompletePSBT(
    spUtxos: SilentPaymentUTXO[],
    targets: { address: string; value?: number }[],
    feeRate: number,
    changeAddress: string,
    sequence: number = 0xffffffff
  ): bitcoin.Psbt {
    // Step 1: Process targets using BlueWallet library
    // This converts any SP addresses to Taproot addresses
    const processedTargets = this.buildTransaction(spUtxos, targets);

    // Step 2: Create PSBT
    const psbt = new bitcoin.Psbt();

    // Step 3: Add inputs using @silent-pay/core pattern
    for (const utxo of spUtxos) {
      const taprootInput = SilentPaymentSpender.createTaprootInput(
        utxo,
        this.spendPubKey
      );

      psbt.addInput({
        hash: taprootInput.hash,
        index: taprootInput.index,
        sequence,
        witnessUtxo: {
          script: taprootInput.witnessUtxo.script,
          value: BigInt(taprootInput.witnessUtxo.value),
        },
        tapInternalKey: taprootInput.tapInternalKey,
      });
    }

    // Step 4: Add outputs
    for (const target of processedTargets) {
      if (target.address && target.value) {
        psbt.addOutput({
          address: target.address,
          value: BigInt(target.value),
        });
      }
    }

    // Step 5: Sign inputs
    spUtxos.forEach((utxo, idx) => {
      SilentPaymentSpender.signTaprootInput(psbt, idx, utxo, this.spendPrivKey);
    });

    return psbt;
  }

  /**
   * Validates that we can spend all provided UTXOs
   */
  validateUTXOs(utxos: SilentPaymentUTXO[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const utxo of utxos) {
      if (!SilentPaymentSpender.verifyTweakedKey(utxo, this.spendPrivKey)) {
        errors.push(`UTXO ${utxo.txid}:${utxo.vout} verification failed`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Estimates transaction size for fee calculation
   * Uses BlueWallet library's UTXO type awareness
   */
  estimateTransactionSize(
    numInputs: number,
    numOutputs: number,
    hasSilentPaymentOutput: boolean
  ): number {
    // All SP inputs are Taproot
    const inputSize = SilentPaymentSpender.getTaprootInputSize() * numInputs;
    
    // Outputs can be Taproot (SP or regular) or other types
    const outputSize = SilentPaymentSpender.getTaprootOutputSize() * numOutputs;
    
    // Transaction overhead (version, locktime, etc.)
    const overhead = 10.5;
    
    return inputSize + outputSize + overhead;
  }

  /**
   * Helper to check if an address is a Silent Payment address
   */
  static isSilentPaymentAddress(address: string): boolean {
    return address.startsWith('sp1');
  }

  /**
   * Create inputs array suitable for BlueWallet's SilentPayment.createTransaction
   * This is useful when you want to use BlueWallet's library features
   */
  static createInputsForBlueWallet(
    spUtxos: SilentPaymentUTXO[],
    spendPrivKey: Uint8Array
  ): SPUTXO[] {
    return spUtxos.map(utxo => {
      const tweakedKeyPair = SilentPaymentSpender.createTweakedKeyPair(
        spendPrivKey,
        utxo.tweak
      );

      return {
        txid: utxo.txid,
        vout: utxo.vout,
        wif: tweakedKeyPair.toWIF(),
        utxoType: 'p2tr' as UTXOType,
      };
    });
  }
}
