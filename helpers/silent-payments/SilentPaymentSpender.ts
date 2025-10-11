import * as bitcoin from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import ecc from '../../blue_modules/noble_ecc';
import { SilentPaymentUTXO } from './types';

const ECPair = ECPairFactory(ecc);

/**
 * Handles spending Silent Payment UTXOs using @silent-pay/core library
 * 
 * Silent Payment outputs are Taproot (P2TR) outputs with tweaked public keys.
 * To spend them, we need to:
 * 1. Add the tweak to the spend private key using ecc.privateAdd()
 * 2. Use the tweaked private key for Schnorr signing
 * 3. Sign as a Taproot key-path spend
 * 
 * This implementation follows the pattern from @silent-pay/core Wallet.signTransaction()
 * Reference: packages/wallet/src/wallet.ts lines 153-177
 */
export class SilentPaymentSpender {
  /**
   * Creates a tweaked ECPair for spending a Silent Payment UTXO
   * Uses ecc.privateAdd() from @silent-pay/core pattern
   * 
   * @param spendPrivKey - The wallet's spend private key (32 bytes)
   * @param tweak - The UTXO's tweak value (32 bytes)
   * @returns ECPair with the tweaked private key
   */
  static createTweakedKeyPair(spendPrivKey: Uint8Array, tweak: Uint8Array): ECPairInterface {
    if (spendPrivKey.length !== 32) {
      throw new Error(`Invalid spend private key length: ${spendPrivKey.length} (expected 32)`);
    }
    if (tweak.length !== 32) {
      throw new Error(`Invalid tweak length: ${tweak.length} (expected 32)`);
    }

    // Use ecc.privateAdd() for proper secp256k1 private key addition
    // This is the same method used in @silent-pay/core Wallet.signTransaction()
    const tweakedPrivKey = ecc.privateAdd(spendPrivKey, tweak);
    
    if (!tweakedPrivKey) {
      throw new Error('Failed to compute tweaked private key (resulted in zero or invalid key)');
    }

    // Create ECPair from tweaked private key
    const keyPair = ECPair.fromPrivateKey(Buffer.from(tweakedPrivKey), { compressed: true });
    
    return keyPair;
  }

  /**
   * Verifies that a tweaked public key matches the expected UTXO public key
   * 
   * @param utxo - The Silent Payment UTXO
   * @param spendPrivKey - The wallet's spend private key
   * @returns true if the tweaked key matches the UTXO's public key
   */
  static verifyTweakedKey(utxo: SilentPaymentUTXO, spendPrivKey: Uint8Array): boolean {
    try {
      const keyPair = this.createTweakedKeyPair(spendPrivKey, utxo.tweak);
      const xOnlyPubkey = keyPair.publicKey.subarray(1, 33); // Remove 0x02/0x03 prefix
      const derivedPubKeyHex = Buffer.from(xOnlyPubkey).toString('hex');
      
      // The UTXO pubKey is already x-only (32 bytes)
      return derivedPubKeyHex === utxo.pubKey;
    } catch (error) {
      console.error('Error verifying tweaked key:', error);
      return false;
    }
  }

  /**
   * Creates the Taproot payment object for a Silent Payment UTXO
   * Follows @silent-pay/core Coin.toInput() pattern exactly
   * Reference: packages/wallet/src/coin.ts lines 40-65
   * 
   * @param utxo - The Silent Payment UTXO
   * @param spendPubKey - The wallet's spend public key (33 bytes compressed)
   * @returns Taproot input object for PSBT
   */
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
    // Use x-only pubkey (remove the first byte if it's a compressed pubkey)
    const xOnlyPub = spendPubKey.subarray(1, 33);
    
    // Add the tweak to get the tweaked output key
    // This matches @silent-pay/core Coin.toInput() pattern exactly
    const result = ecc.xOnlyPointAddTweak(xOnlyPub, utxo.tweak);
    
    if (!result) {
      throw new Error('Failed to compute tweaked public key');
    }
    
    // Construct Taproot witness script (OP_1 + PUSH32 + tweaked pubkey)
    // This is how @silent-pay/core does it
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
      tapInternalKey: Buffer.from(xOnlyPub), // Original x-only pubkey before tweak
    };
  }

  /**
   * Signs a PSBT input for a Silent Payment UTXO
   * Follows @silent-pay/core Wallet.signTransaction() pattern for Schnorr signing
   * 
   * @param psbt - The PSBT to sign
   * @param inputIndex - Index of the input to sign
   * @param utxo - The Silent Payment UTXO being spent
   * @param spendPrivKey - The wallet's spend private key
   */
  static signTaprootInput(
    psbt: bitcoin.Psbt,
    inputIndex: number,
    utxo: SilentPaymentUTXO,
    spendPrivKey: Uint8Array
  ): void {
    try {
      // Create tweaked keypair
      const tweakedKeyPair = this.createTweakedKeyPair(spendPrivKey, utxo.tweak);
      const xOnlyPubkey = tweakedKeyPair.publicKey.subarray(1, 33);
      
      // Create Schnorr signer following @silent-pay/core pattern
      // Reference: packages/wallet/src/wallet.ts lines 163-172
      const schnorrSigner = {
        publicKey: xOnlyPubkey,
        sign: () => {
          throw new Error('Taproot requires Schnorr signing');
        },
        signSchnorr: (msgHash: Buffer) => tweakedKeyPair.signSchnorr(msgHash),
      };
      
      // Sign with Schnorr signature
      psbt.signInput(inputIndex, schnorrSigner as any);
    } catch (error) {
      console.error(`Failed to sign input ${inputIndex}:`, error);
      throw new Error(`Failed to sign Silent Payment input ${inputIndex}: ${error}`);
    }
  }

  /**
   * Converts a Silent Payment UTXO to the format needed for createTransaction
   * 
   * @param utxo - Silent Payment UTXO
   * @param silentPaymentAddress - The wallet's Silent Payment address (for tracking)
   * @returns CreateTransactionUtxo format
   */
  static utxoToTransactionInput(utxo: SilentPaymentUTXO, silentPaymentAddress: string): {
    txid: string;
    vout: number;
    value: number;
    address: string;
    txhex?: string;
  } {
    return {
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: silentPaymentAddress, // Use SP address for reference
    };
  }

  /**
   * Batch verifies multiple UTXOs belong to this wallet
   * 
   * @param utxos - Array of Silent Payment UTXOs
   * @param spendPrivKey - The wallet's spend private key
   * @returns Array of booleans indicating which UTXOs are valid
   */
  static batchVerify(utxos: SilentPaymentUTXO[], spendPrivKey: Uint8Array): boolean[] {
    return utxos.map(utxo => this.verifyTweakedKey(utxo, spendPrivKey));
  }

  /**
   * Estimates the size of a Taproot input in vBytes
   * Used for fee calculation
   * 
   * @returns Input size in vBytes
   */
  static getTaprootInputSize(): number {
    // Taproot key-path spend:
    // - Outpoint: 36 bytes (txid: 32, vout: 4)
    // - Sequence: 4 bytes
    // - Witness: 65 bytes (1 byte stack size + 64 byte signature)
    // Total weight: 234 weight units = 58.5 vBytes
    return 58.5;
  }

  /**
   * Estimates the size of a Taproot output in vBytes
   * 
   * @returns Output size in vBytes
   */
  static getTaprootOutputSize(): number {
    // Taproot output:
    // - Value: 8 bytes
    // - Script length: 1 byte
    // - Script: 34 bytes (OP_1 + 32-byte x-only pubkey)
    // Total: 43 bytes
    return 43;
  }
}
