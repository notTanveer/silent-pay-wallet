import { BIP32Factory, BIP32Interface } from 'bip32';
import {
  encodeSilentPaymentAddress,
  createLabeledSilentPaymentAddress,
  createTaggedHash,
  serialiseUint32,
  type LabelMap,
} from '@silent-pay/core';
import { Buffer } from 'buffer';
import ecc from '../../modules/noble_ecc';

const bip32 = BIP32Factory(ecc);

/** BIP-352 label index used as the wallet's change address by convention. */
export const SP_CHANGE_LABEL = 0;

interface SilentPaymentKeys {
  scanKey: BIP32Interface;
  spendKey: BIP32Interface;
}

function deriveSilentPaymentKeys(seed: Buffer): SilentPaymentKeys {
  const root = bip32.fromSeed(seed);
  const spendKey = root.derivePath("m/352'/0'/0'/0'/0");
  const scanKey = root.derivePath("m/352'/0'/0'/1'/0");

  return { scanKey, spendKey };
}

export function getScanPrivateKey(seed: Buffer): Uint8Array {
  const { scanKey } = deriveSilentPaymentKeys(seed);
  return new Uint8Array(scanKey.privateKey!);
}

export function getSpendPrivateKey(seed: Buffer): Uint8Array {
  const { spendKey } = deriveSilentPaymentKeys(seed);
  return new Uint8Array(spendKey.privateKey!);
}

export function getScanPublicKey(seed: Buffer): Uint8Array {
  const { scanKey } = deriveSilentPaymentKeys(seed);
  return new Uint8Array(scanKey.publicKey);
}

export function getSpendPublicKey(seed: Buffer): Uint8Array {
  const { spendKey } = deriveSilentPaymentKeys(seed);
  return new Uint8Array(spendKey.publicKey);
}

export function getSilentPaymentAddress(seed: Buffer): string {
  const { scanKey, spendKey } = deriveSilentPaymentKeys(seed);
  return encodeSilentPaymentAddress(new Uint8Array(scanKey.publicKey), new Uint8Array(spendKey.publicKey));
}

export function getSilentPaymentChangeAddress(seed: Buffer): string {
  const { scanKey, spendKey } = deriveSilentPaymentKeys(seed);
  return createLabeledSilentPaymentAddress(new Uint8Array(scanKey.privateKey!), new Uint8Array(spendKey.publicKey), SP_CHANGE_LABEL);
}

/** The BIP-352 label scalar `m = hash_BIP0352/Label(b_scan || ser32(label))`. */
function deriveChangeLabelTweak(scanPriv: Uint8Array): Uint8Array {
  return createTaggedHash('BIP0352/Label', Buffer.concat([scanPriv, serialiseUint32(SP_CHANGE_LABEL)]));
}

export function getSilentPaymentChangeSpendPrivateKey(seed: Buffer): Uint8Array {
  const { scanKey, spendKey } = deriveSilentPaymentKeys(seed);
  const m = deriveChangeLabelTweak(new Uint8Array(scanKey.privateKey!));
  const tweakedPriv = ecc.privateAdd(new Uint8Array(spendKey.privateKey!), m);
  if (!tweakedPriv) throw new Error('Failed to derive labeled spend private key');
  return tweakedPriv;
}

/**
 * Label map in the shape `@silent-pay/core`'s scanner expects: `m*G` (hex) -> `m` (hex).
 *
 * A scan run with this map returns a tweak that already carries the label offset, so a
 * matched change output is spendable with the *main* spend key.
 */
export function getSilentPaymentChangeLabelMap(seed: Buffer): LabelMap {
  const { scanKey } = deriveSilentPaymentKeys(seed);
  const m = deriveChangeLabelTweak(new Uint8Array(scanKey.privateKey!));
  const mG = ecc.pointFromScalar(m, true);
  if (!mG) throw new Error('Failed to derive label point');
  return { [Buffer.from(mG).toString('hex')]: Buffer.from(m).toString('hex') };
}

export function getSilentPaymentChangeSpendPublicKey(seed: Buffer): Uint8Array {
  const tweakedPriv = getSilentPaymentChangeSpendPrivateKey(seed);
  const pubkey = ecc.pointFromScalar(tweakedPriv, true);
  if (!pubkey) throw new Error('Failed to derive labeled spend public key');
  return pubkey;
}
