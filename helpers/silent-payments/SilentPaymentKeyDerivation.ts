import { BIP32Factory, BIP32Interface } from 'bip32';
import { encodeSilentPaymentAddress } from '@silent-pay/core';
import { Buffer } from 'buffer';
import ecc from '../../blue_modules/noble_ecc';

const bip32 = BIP32Factory(ecc);


export class SilentPaymentKeyDerivation {
  private scanKey: BIP32Interface | null = null;
  private spendKey: BIP32Interface | null = null;
  private silentPaymentAddress: string | null = null;

  constructor(private seed: Buffer) {}

  private deriveKeys(): void {
    if (this.scanKey !== null && this.spendKey !== null) return;

    const silentPaymentRoot = bip32.fromSeed(this.seed);
    this.spendKey = silentPaymentRoot.derivePath("m/352'/0'/0'/0'/0");
    this.scanKey = silentPaymentRoot.derivePath("m/352'/0'/0'/1'/0");
  }

  getScanPrivateKey(): Uint8Array {
    this.deriveKeys();
    return new Uint8Array(this.scanKey!.privateKey!);
  }

  getSpendPrivateKey(): Uint8Array {
    this.deriveKeys();
    return new Uint8Array(this.spendKey!.privateKey!);
  }

  getScanPublicKey(): Uint8Array {
    this.deriveKeys();
    return new Uint8Array(this.scanKey!.publicKey);
  }

  getSpendPublicKey(): Uint8Array {
    this.deriveKeys();
    return new Uint8Array(this.spendKey!.publicKey);
  }

  getSilentPaymentAddress(): string {
    if (this.silentPaymentAddress) {
      return this.silentPaymentAddress;
    }

    this.deriveKeys();
    this.silentPaymentAddress = encodeSilentPaymentAddress(
      new Uint8Array(this.scanKey!.publicKey),
      new Uint8Array(this.spendKey!.publicKey),
    );

    return this.silentPaymentAddress;
  }

  clear(): void {
    this.scanKey = null;
    this.spendKey = null;
    this.silentPaymentAddress = null;
  }
}
