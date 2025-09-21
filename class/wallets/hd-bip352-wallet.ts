import { BIP32Factory, BIP32Interface } from 'bip32';
import { encodeSilentPaymentAddress } from '@silent-pay/core';
import ecc from '../../blue_modules/noble_ecc';
import { HDSegwitBech32Wallet } from './hd-segwit-bech32-wallet';

const bip32 = BIP32Factory(ecc);

export class HDSilentPaymentsWallet extends HDSegwitBech32Wallet {
  static readonly type = 'HDsilentPayments';
  static readonly typeReadable = 'HD Silent Payments (BIP352)';
  // @ts-ignore: override
  public readonly type = HDSilentPaymentsWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = HDSilentPaymentsWallet.typeReadable;
  static readonly derivationPath = "m/352'/0'/0'";

  private _silentPaymentAddress: string | null = null;
  private _scanKey: BIP32Interface | null = null;
  private _spendKey: BIP32Interface | null = null;

  ensureKeys(): void {
    if (this._scanKey !== null && this._spendKey !== null) return;

    const start = Date.now();
    const seed = this._getSeed();
    const silentPaymentRoot = bip32.fromSeed(seed);
    console.log('Silent Payments: derived root in', Date.now() - start, 'ms');

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

  clearCache(): void {
    this._silentPaymentAddress = null;
    this._scanKey = null;
    this._spendKey = null;
  }
}
