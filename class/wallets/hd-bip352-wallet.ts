import { BIP32Factory, BIP32Interface } from 'bip32';
import { encodeSilentPaymentAddress } from '@silent-pay/core';
import * as bip39 from 'bip39';
import ecc from '../../blue_modules/noble_ecc';
import { HDSegwitBech32Wallet } from './hd-segwit-bech32-wallet.ts';

const bip32 = BIP32Factory(ecc);

export class HDSilentPaymentsWallet extends HDSegwitBech32Wallet {
  static readonly type = 'HDSilentPaymentsWallet';
  static readonly typeReadable = 'HD Silent Payments';
  // @ts-ignore: override
  public readonly type = HDSilentPaymentsWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = HDSilentPaymentsWallet.typeReadable;

  private _silentPaymentAddress: string | null = null;
  private _scanKey: BIP32Interface | null = null;
  private _spendKey: BIP32Interface | null = null;
  private _cachedSeed: Buffer | null = null;

  ensureKeys(): void {
    if (this._scanKey !== null && this._spendKey !== null) return;

    const seed = this._getSeed();
    const silentPaymentRoot = bip32.fromSeed(seed);

    this._spendKey = silentPaymentRoot.derivePath("m/352'/0'/0'/0'/0");
    this._scanKey = silentPaymentRoot.derivePath("m/352'/0'/0'/1'/0");
  }

  getSilentPaymentAddress(): string | null {
    if (this._silentPaymentAddress) {
      return this._silentPaymentAddress;
    }

    this.ensureKeys();

    this._silentPaymentAddress = encodeSilentPaymentAddress(
      new Uint8Array(this._scanKey!.publicKey),
      new Uint8Array(this._spendKey!.publicKey),
    );

    return this._silentPaymentAddress;
  }

  getScanPrivateKey(): Uint8Array {
    this.ensureKeys();
    return new Uint8Array(this._scanKey!.privateKey!);
  }

  getSpendPrivateKey(): Uint8Array {
    this.ensureKeys();
    return new Uint8Array(this._spendKey!.privateKey!);
  }

  getScanPublicKey(): Uint8Array {
    this.ensureKeys();
    return new Uint8Array(this._scanKey!.publicKey);
  }

  getSpendPublicKey(): Uint8Array {
    this.ensureKeys();
    return new Uint8Array(this._spendKey!.publicKey);
  }

  /**
   * Override to bypass passphrase processing for performance.
   * Since we don't support passphrases for Silent Payments wallets, 
   * we use an empty string to skip expensive passphrase derivation.
   * 
   * @return {Buffer} wallet seed without passphrase
   */
  _getSeed(): Buffer {
    if (this._cachedSeed)
      return this._cachedSeed;
    
    const mnemonic = this.secret;
    // no passphrase support - use empty string to avoid PBKDF2 overhead
    this._cachedSeed = bip39.mnemonicToSeedSync(mnemonic, '');
    return this._cachedSeed!;
  }

  clearCache(): void {
    this._silentPaymentAddress = null;
    this._scanKey = null;
    this._spendKey = null;
    this._cachedSeed = null;
  }
}
