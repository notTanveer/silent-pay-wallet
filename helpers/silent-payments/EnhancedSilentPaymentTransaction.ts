import * as bitcoin from 'bitcoinjs-lib';
import { CreateTransactionResult, CreateTransactionTarget, CreateTransactionUtxo } from '../../class/wallets/types';
import { SilentPaymentUTXO } from './types';
import { SilentPaymentSpender } from './SilentPaymentSpender';
import { SilentPayment, UTXO as SPUTXO, Target } from 'silent-payments';

/**
 * Example: Enhanced createTransaction() implementation for HD-BIP352 wallet
 * 
 * This demonstrates how to use both libraries together:
 * - @silent-pay/core for spending FROM SP UTXOs
 * - BlueWallet silent-payments for sending TO SP addresses
 * 
 * You can integrate this into your HDSilentPaymentsWallet class
 */
export class EnhancedSilentPaymentTransaction {
  
  /**
   * Enhanced version of createTransaction that handles:
   * 1. Spending Silent Payment UTXOs (using tweaked keys)
   * 2. Sending to Silent Payment addresses (using BlueWallet library)
   * 3. Sending to regular Bitcoin addresses
   * 
   * This can replace the existing createTransaction in hd-bip352-wallet.ts
   */
  static createTransaction(
    // Wallet keys
    spendPrivKey: Uint8Array,
    spendPubKey: Uint8Array,
    silentPaymentAddress: string,
    
    // Transaction inputs
    utxos: CreateTransactionUtxo[],
    spUtxos: SilentPaymentUTXO[],
    
    // Transaction outputs
    targets: CreateTransactionTarget[],
    
    // Configuration
    feeRate: number,
    changeAddress: string,
    sequence: number = 0xffffffff,
    skipSigning: boolean = false,
  ): CreateTransactionResult {
    
    if (targets.length === 0) {
      throw new Error('No destination provided');
    }

    // Verify all SP UTXOs belong to us
    const utxoMap = new Map<string, SilentPaymentUTXO>();
    for (const spUtxo of spUtxos) {
      const key = `${spUtxo.txid}:${spUtxo.vout}`;
      utxoMap.set(key, spUtxo);
      
      // Verify the UTXO
      if (!SilentPaymentSpender.verifyTweakedKey(spUtxo, spendPrivKey)) {
        throw new Error(`UTXO ${key} verification failed - tweaked key mismatch`);
      }
    }

    // Match provided utxos with SP UTXOs
    for (const utxo of utxos) {
      const key = `${utxo.txid}:${utxo.vout}`;
      const spUtxo = utxoMap.get(key);
      
      if (!spUtxo) {
        throw new Error(`UTXO ${key} not found in wallet's SP UTXOs`);
      }
    }

    // ==========================================
    // STEP 1: Process targets with BlueWallet library
    // This converts any SP addresses to Taproot addresses
    // ==========================================
    
    let processedTargets = targets;
    const hasSilentPaymentTarget = targets.some(t => t.address?.startsWith('sp1'));
    
    if (hasSilentPaymentTarget) {
      console.log('Processing Silent Payment addresses in targets...');
      
      // Convert SP UTXOs to BlueWallet format
      const bluewalletUtxos: SPUTXO[] = utxos.map(utxo => {
        const key = `${utxo.txid}:${utxo.vout}`;
        const spUtxo = utxoMap.get(key)!;
        
        // Create tweaked keypair
        const tweakedKeyPair = SilentPaymentSpender.createTweakedKeyPair(
          spendPrivKey,
          spUtxo.tweak
        );
        
        return {
          txid: utxo.txid,
          vout: utxo.vout,
          wif: tweakedKeyPair.toWIF(),
          utxoType: 'p2tr' as const,
        };
      });
      
      // Use BlueWallet library to process SP addresses
      const sp = new SilentPayment();
      const bluewalletTargets: Target[] = targets.map(t => ({
        address: t.address,
        value: t.value,
      }));
      
      const converted = sp.createTransaction(bluewalletUtxos, bluewalletTargets);
      
      // Map back to our format
      processedTargets = converted.map(t => ({
        address: t.address,
        value: t.value,
      })) as CreateTransactionTarget[];
      
      console.log('Silent Payment addresses converted to Taproot');
    }

    // ==========================================
    // STEP 2: Calculate fees and coin selection
    // Use existing coin selection logic from parent class
    // ==========================================
    
    // Note: In real implementation, you'd use the wallet's coinselect method
    // For this example, we'll assume inputs/outputs are already selected
    const inputs = utxos;
    const outputs = processedTargets;
    
    // Calculate fee (simplified - use proper fee calculation in production)
    const estimatedSize = this.estimateTransactionSize(inputs.length, outputs.length);
    const fee = Math.ceil(estimatedSize * feeRate);

    // ==========================================
    // STEP 3: Create PSBT with inputs
    // Use @silent-pay/core pattern for input creation
    // ==========================================
    
    const psbt = new bitcoin.Psbt();

    // Add inputs using Taproot pattern from @silent-pay/core
    inputs.forEach((input) => {
      const key = `${input.txid}:${input.vout}`;
      const spUtxo = utxoMap.get(key);

      if (!spUtxo) {
        throw new Error(`Silent Payment UTXO not found for input: ${key}`);
      }

      // Create Taproot input following @silent-pay/core pattern
      const taprootInput = SilentPaymentSpender.createTaprootInput(spUtxo, spendPubKey);

      // Add to PSBT
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
    });

    // ==========================================
    // STEP 4: Add outputs
    // Outputs now include converted SP addresses
    // ==========================================
    
    outputs.forEach(output => {
      // If no address, use Silent Payment address for change
      const outputAddress = output.address || changeAddress || silentPaymentAddress;

      if (!outputAddress) {
        throw new Error('No output address specified');
      }

      psbt.addOutput({
        address: outputAddress,
        value: BigInt(output.value || 0),
      });
    });

    // ==========================================
    // STEP 5: Sign inputs
    // Use @silent-pay/core Schnorr signing
    // ==========================================
    
    let tx: bitcoin.Transaction | undefined;
    
    if (!skipSigning) {
      // Sign each input with the tweaked key
      inputs.forEach((input, idx) => {
        const key = `${input.txid}:${input.vout}`;
        const spUtxo = utxoMap.get(key);

        if (!spUtxo) {
          throw new Error(`Silent Payment UTXO not found for signing: ${key}`);
        }

        // Sign with tweaked key using @silent-pay/core pattern
        SilentPaymentSpender.signTaprootInput(psbt, idx, spUtxo, spendPrivKey);
      });

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      tx = psbt.extractTransaction();
    }

    return {
      tx,
      inputs,
      outputs: outputs as any, // Type compatibility with CoinSelectOutput
      fee,
      psbt,
    };
  }

  /**
   * Estimate transaction size in vBytes
   * Silent Payment transactions are always Taproot
   */
  private static estimateTransactionSize(numInputs: number, numOutputs: number): number {
    const inputSize = SilentPaymentSpender.getTaprootInputSize(); // 58.5 vB per input
    const outputSize = SilentPaymentSpender.getTaprootOutputSize(); // 43 vB per output
    const overhead = 10.5; // version, locktime, etc.
    
    return (inputSize * numInputs) + (outputSize * numOutputs) + overhead;
  }

  /**
   * Example: Simple helper to send to a single address
   * Shows how to use the enhanced transaction builder
   */
  static async sendToAddress(
    wallet: {
      getSpendPrivateKey(): Uint8Array;
      getSpendPublicKey(): Uint8Array;
      getSilentPaymentAddress(): string | null;
      getUTXOs(): SilentPaymentUTXO[];
    },
    toAddress: string,
    amount: number,
    feeRate: number = 2
  ): Promise<CreateTransactionResult> {
    
    const spendPrivKey = wallet.getSpendPrivateKey();
    const spendPubKey = wallet.getSpendPublicKey();
    const spAddress = wallet.getSilentPaymentAddress();
    
    if (!spAddress) {
      throw new Error('Failed to derive Silent Payment address');
    }

    // Get available UTXOs
    const spUtxos = wallet.getUTXOs().filter(utxo => !utxo.isSpent);
    
    if (spUtxos.length === 0) {
      throw new Error('No spendable UTXOs available');
    }

    // Simple coin selection (use first UTXO with enough balance)
    let selectedUtxos: SilentPaymentUTXO[] = [];
    let totalValue = 0;
    
    for (const utxo of spUtxos) {
      selectedUtxos.push(utxo);
      totalValue += utxo.value;
      
      // Rough estimate for fee
      const estimatedFee = Math.ceil(
        this.estimateTransactionSize(selectedUtxos.length, 2) * feeRate
      );
      
      if (totalValue >= amount + estimatedFee) {
        break;
      }
    }
    
    if (totalValue < amount) {
      throw new Error(`Insufficient balance. Have ${totalValue}, need ${amount}`);
    }

    // Calculate change
    const estimatedFee = Math.ceil(
      this.estimateTransactionSize(selectedUtxos.length, 2) * feeRate
    );
    const change = totalValue - amount - estimatedFee;

    // Build targets
    const targets: CreateTransactionTarget[] = [
      { address: toAddress, value: amount }
    ];
    
    if (change > 546) { // Dust limit
      targets.push({ address: spAddress, value: change });
    }

    // Convert to CreateTransactionUtxo format
    const utxos: CreateTransactionUtxo[] = selectedUtxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: spAddress,
    }));

    return this.createTransaction(
      spendPrivKey,
      spendPubKey,
      spAddress,
      utxos,
      selectedUtxos,
      targets,
      feeRate,
      spAddress,
      0xffffffff,
      false
    );
  }
}

/**
 * Usage Example:
 * 
 * // In your HDSilentPaymentsWallet class:
 * 
 * createTransaction(
 *   utxos: CreateTransactionUtxo[],
 *   targets: CreateTransactionTarget[],
 *   feeRate: number,
 *   changeAddress: string,
 *   sequence: number = 0xffffffff,
 *   skipSigning: boolean = false,
 * ): CreateTransactionResult {
 *   this.ensureServices();
 * 
 *   const spendPrivKey = this.getSpendPrivateKey();
 *   const spendPubKey = this.getSpendPublicKey();
 *   const spAddress = this.getSilentPaymentAddress()!;
 *   
 *   // Get matching SP UTXOs
 *   const spUtxos = this.getUTXOs();
 *   
 *   return EnhancedSilentPaymentTransaction.createTransaction(
 *     spendPrivKey,
 *     spendPubKey,
 *     spAddress,
 *     utxos,
 *     spUtxos,
 *     targets,
 *     feeRate,
 *     changeAddress,
 *     sequence,
 *     skipSigning
 *   );
 * }
 */
