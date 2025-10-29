import * as bitcoin from 'bitcoinjs-lib';
import { SilentPayment, UTXO as SPUTXO, UTXOType, Target } from 'silent-payments';
import { SilentPaymentUTXO } from './types';
import { SilentPaymentSpender } from './SilentPaymentSpender';


export class SilentPaymentTransactionBuilder {
  private spendPrivKey: Uint8Array;
  private spendPubKey: Uint8Array;

  constructor(spendPrivKey: Uint8Array, spendPubKey: Uint8Array) {
    this.spendPrivKey = spendPrivKey;
    this.spendPubKey = spendPubKey;
  }

  private convertToBlueWalletUTXO(utxo: SilentPaymentUTXO): SPUTXO {
    const tweakedKeyPair = SilentPaymentSpender.createTweakedKeyPair(
      this.spendPrivKey,
      utxo.tweak
    );

    return {
      txid: utxo.txid,
      vout: utxo.vout,
      wif: tweakedKeyPair.toWIF(),
      utxoType: 'p2tr' as UTXOType
    };
  }

  buildTransaction(
    spUtxos: SilentPaymentUTXO[],
    targets: { address: string; value?: number }[]
  ): Target[] {
    const bluewalletUtxos = spUtxos.map(utxo => this.convertToBlueWalletUTXO(utxo));
    return new SilentPayment().createTransaction(bluewalletUtxos, targets);
  }

  /**
   * creates a complete PSBT for spending SP UTXOs
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
    const totalInput = spUtxos.reduce((sum, u) => sum + u.value, 0);
    const isSendMax = targets.length === 1 && !targets[0].value;
    const processedTargets = this.buildTransaction(spUtxos, targets);
    
    let totalOutput = 0;
    for (const target of processedTargets) {
      if (target.value) {
        totalOutput += target.value;
      }
    }
    
    let estimatedSize = this.estimateTransactionSize(
      spUtxos.length,
      processedTargets.length + 1, // +1 for potential change
    );
    let estimatedFee = Math.ceil(estimatedSize * feeRate);
    
    if (isSendMax) {
      // re-estimate without change for send-max
      estimatedSize = this.estimateTransactionSize(
        spUtxos.length,
        processedTargets.length,
      );
      estimatedFee = Math.ceil(estimatedSize * feeRate);
      
      const maxSendAmount = totalInput - estimatedFee;
      
      if (maxSendAmount <= 0) {
        throw new Error(`Insufficient funds: need at least ${estimatedFee} sats for fee, have ${totalInput}`);
      }
      // update wallet target
      processedTargets[0].value = maxSendAmount;
      totalOutput = maxSendAmount;
    }
    
    const change = totalInput - totalOutput - estimatedFee;
    
    if (change < 0) {
      const needed = totalOutput + estimatedFee;
      throw new Error(`Insufficient funds: need ${needed} sats (${totalOutput} + ${estimatedFee} fee), have ${totalInput}`);
    }
    
    const psbt = new bitcoin.Psbt();
    
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
    
    for (const target of processedTargets) {
      if (target.address && target.value) {
        psbt.addOutput({
          address: target.address,
          value: BigInt(target.value),
        });
      }
    }
    
    // Add change output (dust threshold: 546 sats)
    const DUST_THRESHOLD = 546;
    if (change > DUST_THRESHOLD) {
      psbt.addOutput({
        address: changeAddress,
        value: BigInt(change),
      });
    } else if (change > 0) {
      console.log(`[SP] Change ${change} sats below dust threshold, adding to fee`);
    }
    
    spUtxos.forEach((utxo, idx) => {
      SilentPaymentSpender.signTaprootInput(psbt, idx, utxo, this.spendPrivKey);
    });
    
    return psbt;
  }

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

  estimateTransactionSize(
    numInputs: number,
    numOutputs: number,
  ): number {
    const inputSize = SilentPaymentSpender.getTaprootInputSize() * numInputs;
    const outputSize = SilentPaymentSpender.getTaprootOutputSize() * numOutputs;
    const overhead = 10.5; // txn overhead (version, locktime, etc.)
    
    return inputSize + outputSize + overhead;
  }

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
