import * as bitcoin from 'bitcoinjs-lib';
import { decodeSilentPaymentAddress } from '@silent-pay/core';
import * as bip39 from 'bip39';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';
import ecc from '../../modules/noble_ecc.ts';
import { type SilentPaymentUTXO } from '../../helpers/silent-payments/types.ts';
import { getSilentPaymentChangeSpendPublicKey } from '../../helpers/silent-payments';
import { type CreateTransactionUtxo } from '../../class/wallets/types.ts';

const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** A synthetic SP UTXO whose output key is `spendPubKey + tweak`, as a real one would be. */
const buildUtxo = (spendPubKey: Uint8Array, silentPaymentAddress: string, tweakByte: number): SilentPaymentUTXO => {
  const tweak = new Uint8Array(32);
  tweak[31] = tweakByte;
  const tweakedPub = ecc.pointAddScalar(spendPubKey, tweak, true);
  if (!tweakedPub) throw new Error('synthetic tweak produced invalid point');
  const outputKey = Buffer.from(tweakedPub.subarray(1, 33));

  return {
    txid: '1111111111111111111111111111111111111111111111111111111111111111',
    vout: 0,
    value: 100_000,
    height: 800_000,
    address: bitcoin.payments.p2tr({ pubkey: outputKey }).address!,
    silentPaymentAddress,
    pubKey: outputKey.toString('hex'),
    tweak,
    blockHash: '',
    blockTime: 0,
    isSpent: false,
  };
};

describe('BIP-352 Silent Payments', () => {
  it.each([
    {
      seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      expectedAddress:
        'sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g',
    },
    {
      seed: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo glue',
      expectedAddress:
        'sp1qqvchcnrcqpdutxhpf57ptn3wajj0ymqxwzu9g6vj9uxx3wuvlykhyqh99hyh33y5593802pzw5rtw040zrw9f8re52tgcwngc5974w5evuufdy0m',
    },
  ])('should generate a valid silent payment address', ({ seed, expectedAddress }) => {
    const wallet = new HDSilentPaymentsWallet();
    wallet.setSecret(seed);
    const silentPaymentAddress = wallet.getSilentPaymentAddress();
    expect(silentPaymentAddress).toBe(expectedAddress);
  });

  describe('createSPTransaction handles both spend pubkey parities', () => {
    it.each([
      {
        label: 'even-Y (0x02)',
        seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        expectedParity: 0x02,
      },
      { label: 'odd-Y (0x03)', seed: 'all all all all all all all all all all all all', expectedParity: 0x03 },
    ])('signs a key-path Taproot input for $label spend pubkey', ({ seed, expectedParity }) => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(seed);

      const spendPubKey = wallet.getSpendPublicKey();
      expect(spendPubKey[0]).toBe(expectedParity);

      const utxo = buildUtxo(spendPubKey, wallet.getSilentPaymentAddress()!, 0x07);
      const expectedOutputKey = Buffer.from(utxo.pubKey, 'hex');

      const targetAddress = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
      const result = wallet.createTransaction(
        [utxo as never],
        [{ address: targetAddress, value: 50_000 }],
        2,
        utxo.address,
        0xfffffffd,
        false,
        0,
      );

      expect(result.tx).toBeDefined();
      const tx = result.tx!;
      expect(tx.ins).toHaveLength(1);

      const witness = tx.ins[0].witness;
      expect(witness).toHaveLength(1);
      const sig = witness[0];
      expect(sig.length === 64 || sig.length === 65).toBe(true);

      const sighash = tx.hashForWitnessV1(
        0,
        [Buffer.concat([Buffer.from([0x51, 0x20]), expectedOutputKey])],
        [BigInt(utxo.value)],
        bitcoin.Transaction.SIGHASH_DEFAULT,
      );
      const sig64 = sig.length === 65 ? Buffer.from(sig.subarray(0, 64)) : Buffer.from(sig);
      expect(ecc.verifySchnorr!(sighash, expectedOutputKey, sig64)).toBe(true);
    });
  });

  describe('createSPTransaction verifies Schnorr signatures locally before returning', () => {
    const targetAddress = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

    // produce a structurally valid Schnorr signature over the WRONG sighash: it parses fine
    // but cannot verify against the input's real sighash, like a signing bug would produce
    const mockBadSignature = () => {
      const realSignSchnorr = ecc.signSchnorr!;
      const wrongSighash = new Uint8Array(32).fill(0xaa);
      return jest.spyOn(ecc, 'signSchnorr').mockImplementation((_h, d, e) => realSignSchnorr(wrongSighash, d, e));
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('throws instead of returning a transaction when the signature does not verify', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);
      const utxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07);
      mockBadSignature();

      expect(() =>
        wallet.createTransaction([utxo as never], [{ address: targetAddress, value: 50_000 }], 2, utxo.address, 0xfffffffd, false, 0),
      ).toThrow(/Schnorr signature verification failed/);
    });

    it('releases reserved UTXOs when verification fails, so the inputs are not stuck pending', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);
      const utxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07);
      mockBadSignature();

      expect(() =>
        wallet.createTransaction([utxo as never], [{ address: targetAddress, value: 50_000 }], 2, utxo.address, 0xfffffffd, false, 0),
      ).toThrow();

      const pendingInputs = (wallet as any)._sp_pending_inputs as Set<string>;
      expect(pendingInputs.has(`${utxo.txid}:${utxo.vout}`)).toBe(false);

      jest.restoreAllMocks();

      const result = wallet.createTransaction(
        [utxo as never],
        [{ address: targetAddress, value: 50_000 }],
        2,
        utxo.address,
        0xfffffffd,
        false,
        0,
      );
      expect(result.tx).toBeDefined();
    });
  });

  describe('label-0 change address', () => {
    it('derives the same labeled spend key as the encoded change address', () => {
      // These are two independent derivations of B_m: ours (b_spend + hash(scan||ser32(0)))
      // and the library's, via the encoded address. A drift here means unspendable change.
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const changeAddress = wallet.getSilentPaymentChangeAddress();
      const fromAddress = decodeSilentPaymentAddress(changeAddress).spendKey;
      const derived = getSilentPaymentChangeSpendPublicKey(bip39.mnemonicToSeedSync(TEST_SEED, ''));

      expect(Buffer.from(derived).toString('hex')).toBe(Buffer.from(fromAddress).toString('hex'));
      expect(changeAddress).not.toBe(wallet.getSilentPaymentAddress());
    });

    it('signs a change UTXO with the labeled spend key', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const changeSpendPubKey = getSilentPaymentChangeSpendPublicKey(bip39.mnemonicToSeedSync(TEST_SEED, ''));
      const utxo = buildUtxo(changeSpendPubKey, wallet.getSilentPaymentAddress()!, 0x07);
      const expectedOutputKey = Buffer.from(utxo.pubKey, 'hex');

      const result = wallet.createTransaction(
        [utxo as never],
        [{ address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', value: 50_000 }],
        2,
        utxo.address,
        0xfffffffd,
        false,
        0,
      );

      const tx = result.tx!;
      expect(tx.ins).toHaveLength(1);

      const sighash = tx.hashForWitnessV1(
        0,
        [Buffer.concat([Buffer.from([0x51, 0x20]), expectedOutputKey])],
        [BigInt(utxo.value)],
        bitcoin.Transaction.SIGHASH_DEFAULT,
      );
      const sig = tx.ins[0].witness[0];
      const sig64 = sig.length === 65 ? Buffer.from(sig.subarray(0, 64)) : Buffer.from(sig);
      expect(ecc.verifySchnorr!(sighash, expectedOutputKey, sig64)).toBe(true);
    });

    it('rejects a UTXO no spend key of ours can own', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const utxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07);
      // Corrupt the stored output key so neither the main nor the labeled key reproduces it.
      const corrupted = { ...utxo, pubKey: Buffer.from(utxo.pubKey, 'hex').reverse().toString('hex') };

      expect(() =>
        wallet.createTransaction(
          [corrupted as never],
          [{ address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', value: 50_000 }],
          2,
          utxo.address,
          0xfffffffd,
          false,
          0,
        ),
      ).toThrow(/no spend key reproduces/);
    });
  });

  describe('post-broadcast change scan', () => {
    const RECIPIENT_SP =
      'sp1qqvchcnrcqpdutxhpf57ptn3wajj0ymqxwzu9g6vj9uxx3wuvlykhyqh99hyh33y5593802pzw5rtw040zrw9f8re52tgcwngc5974w5evuufdy0m';

    it('finds the label-0 change output and the change it finds is spendable', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const utxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07);
      (wallet as any)._utxo = [utxo];

      const { tx } = wallet.createTransaction(
        [utxo as never],
        [{ address: RECIPIENT_SP, value: 50_000 }],
        2,
        wallet.getSilentPaymentChangeAddress(),
        0xfffffffd,
        false,
        0,
      );
      expect(tx!.outs).toHaveLength(2);

      (wallet as any).scanBroadcastedTxForOurOutputs(tx!, tx!.getId());

      const found = (wallet as any)._utxo.filter((u: SilentPaymentUTXO) => u.txid === tx!.getId());
      expect(found).toHaveLength(1);

      // The scan is only useful if the coin it records can actually be spent again.
      const change = found[0] as SilentPaymentUTXO;
      const changeOutputKey = Buffer.from(change.pubKey, 'hex');
      const spend = wallet.createTransaction(
        [change as never],
        [{ address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr', value: change.value - 5_000 }],
        2,
        change.address,
        0xfffffffd,
        false,
        0,
      );

      const sighash = spend.tx!.hashForWitnessV1(
        0,
        [Buffer.concat([Buffer.from([0x51, 0x20]), changeOutputKey])],
        [BigInt(change.value)],
        bitcoin.Transaction.SIGHASH_DEFAULT,
      );
      const sig = spend.tx!.ins[0].witness[0];
      const sig64 = sig.length === 65 ? Buffer.from(sig.subarray(0, 64)) : Buffer.from(sig);
      expect(ecc.verifySchnorr!(sighash, changeOutputKey, sig64)).toBe(true);
    });

    it('bails out when an input is not ours, rather than deriving a wrong tweak', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const utxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07);
      (wallet as any)._utxo = [utxo];

      const { tx } = wallet.createTransaction(
        [utxo as never],
        [{ address: RECIPIENT_SP, value: 50_000 }],
        2,
        wallet.getSilentPaymentChangeAddress(),
        0xfffffffd,
        false,
        0,
      );

      // Same transaction, but now we no longer hold the input: the input hash would be
      // computed over a key we don't have, so any tweak derived from it is wrong.
      (wallet as any)._utxo = [];
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (wallet as any).scanBroadcastedTxForOurOutputs(tx!, tx!.getId());

      expect((wallet as any)._utxo).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not one of our SP UTXOs'));
      warn.mockRestore();
    });
  });

  describe('getChangeAddressForUtxos', () => {
    const regularUtxo = {
      txid: '2222222222222222222222222222222222222222222222222222222222222222',
      vout: 0,
      value: 50_000,
      address: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    } as CreateTransactionUtxo;

    it('uses the label-0 address only when every UTXO is a silent payment UTXO', () => {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(TEST_SEED);

      const spUtxo = buildUtxo(wallet.getSpendPublicKey(), wallet.getSilentPaymentAddress()!, 0x07) as CreateTransactionUtxo;
      const fallback = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

      expect(wallet.getChangeAddressForUtxos([spUtxo], fallback)).toBe(wallet.getSilentPaymentChangeAddress());

      // A regular UTXO routes to the parent builder, which cannot encode an sp1 change
      // output — handing it one throws "has no matching Script".
      expect(wallet.getChangeAddressForUtxos([regularUtxo], fallback)).toBe(fallback);
      expect(wallet.getChangeAddressForUtxos([spUtxo, regularUtxo], fallback)).toBe(fallback);
      expect(wallet.getChangeAddressForUtxos([], fallback)).toBe(fallback);
    });
  });
});
