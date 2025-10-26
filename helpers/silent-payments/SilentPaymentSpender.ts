// this file is heavily inspired by @silent-pay/core's implementation
// but adapted for wallet usage

import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import ecc from '../../blue_modules/noble_ecc';
import { SilentPaymentUTXO } from './types';


const ECPair = ECPairFactory(ecc);

export class SilentPaymentSpender {
  // creates a tweaked key pair for signing Silent Payment UTXOs
  static createTweakedKeyPair(spendPrivKey: Uint8Array, tweak: Uint8Array): ECPairInterface {
    const tweakedPrivKey = ecc.privateAdd(spendPrivKey, tweak);
    
    if (!tweakedPrivKey) {
      throw new Error('Failed to compute tweaked private key (resulted in zero or invalid key)');
    }

    return ECPair.fromPrivateKey(Buffer.from(tweakedPrivKey), { compressed: true });
  }

  static verifyTweakedKey(utxo: SilentPaymentUTXO, spendPrivKey: Uint8Array): boolean {
    try {
      const keyPair = this.createTweakedKeyPair(spendPrivKey, utxo.tweak);
      const xOnlyPubkey = keyPair.publicKey.subarray(1, 33);
      const derivedPubKeyHex = Buffer.from(xOnlyPubkey).toString('hex');
      
      return derivedPubKeyHex === utxo.pubKey;
    } catch (error) {
      console.error('Error verifying tweaked key:', error);
      return false;
    }
  }

  static createTaprootInput(
    utxo: SilentPaymentUTXO, 
    spendPubKey: Uint8Array
  ): {
    hash: string;
    index: number;
    witnessUtxo: {
      script: Buffer;
      value: number;
    };
    tapInternalKey: Buffer;
  } {
    const xOnlyPub = spendPubKey.subarray(1, 33);
    const result = ecc.xOnlyPointAddTweak(xOnlyPub, utxo.tweak);
    
    if (!result) {
      throw new Error('Failed to compute tweaked public key');
    }
    
    const witnessScript = Buffer.concat([
      Buffer.from([0x51, 0x20]), // OP_1 + PUSH32 (Taproot script)
      result.xOnlyPubkey,
    ]);

    return {
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: witnessScript,
        value: utxo.value,
      },
      tapInternalKey: Buffer.from(xOnlyPub),
    };
  }

  static signTaprootInput(
    psbt: bitcoin.Psbt,
    inputIndex: number,
    utxo: SilentPaymentUTXO,
    spendPrivKey: Uint8Array
  ): void {
    try {
      const tweakedKeyPair = this.createTweakedKeyPair(spendPrivKey, utxo.tweak);
      const xOnlyPubkey = tweakedKeyPair.publicKey.subarray(1, 33);
      
      const schnorrSigner = {
        publicKey: xOnlyPubkey,
        sign: () => {
          throw new Error('Taproot requires Schnorr signing');
        },
        signSchnorr: (msgHash: Buffer) => tweakedKeyPair.signSchnorr(msgHash),
      };
      
      psbt.signInput(inputIndex, schnorrSigner as any);
    } catch (error) {
      console.error(`Failed to sign input ${inputIndex}:`, error);
      throw new Error(`Failed to sign Silent Payment input ${inputIndex}: ${error}`);
    }
  }

  static getTaprootInputSize(): number {
    // Taproot key-path spend:
    // - Outpoint: 36 bytes (txid: 32, vout: 4)
    // - Sequence: 4 bytes
    // - Witness: 65 bytes (1 byte stack size + 64 byte signature)
    // Total weight: 234 weight units = 58.5 vBytes
    return 58.5;
  }

  static getTaprootOutputSize(): number {
    // Taproot output:
    // - Value: 8 bytes
    // - Script length: 1 byte
    // - Script: 34 bytes (OP_1 + 32-byte x-only pubkey)
    // Total: 43 bytes
    return 43;
  }
}
