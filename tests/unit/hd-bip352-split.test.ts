import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function makeWallet(): HDSilentPaymentsWallet {
  const w = new HDSilentPaymentsWallet();
  w.setSecret(MNEMONIC);
  return w;
}

describe('getChangeAddresses', () => {
  it('returns N distinct sequential addresses without advancing the pointer', () => {
    const w = makeWallet();
    const base = w.next_free_change_address_index;
    const addrs: string[] = (w as any).getChangeAddresses(3);
    expect(addrs).toHaveLength(3);
    expect(new Set(addrs).size).toBe(3);
    expect(addrs[0]).toBe(w._getInternalAddressByIndex(base));
    expect(addrs[2]).toBe(w._getInternalAddressByIndex(base + 2));
    // planning must not consume indices: previews/RBF rebuilds would leak toward the gap limit
    expect(w.next_free_change_address_index).toBe(base);
  });

  it('is idempotent across repeated planning calls', () => {
    const w = makeWallet();
    const a = (w as any).getChangeAddresses(2);
    const b = (w as any).getChangeAddresses(2);
    expect(b).toEqual(a);
  });
});

describe('shuffleOutputs', () => {
  it('preserves the multiset of elements', async () => {
    const w = makeWallet();
    const input = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }];
    const out = await (w as any).shuffleOutputs(input);
    expect(out).toHaveLength(5);
    expect(out.map((o: any) => o.v).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('reorders across trials (not always identity)', async () => {
    const w = makeWallet();
    let reordered = false;
    for (let trial = 0; trial < 20 && !reordered; trial++) {
      const out = await (w as any).shuffleOutputs([1, 2, 3, 4, 5]);
      if (out.join(',') !== '1,2,3,4,5') reordered = true;
    }
    expect(reordered).toBe(true);
  });
});

describe('planSplitTransaction', () => {
  const SP = 'sp1qexamplerecipientaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

  it('payment outputs all carry the sp address and sum to the payment value', async () => {
    const w = makeWallet();
    const { outputs } = await (w as any).planSplitTransaction(SP, 500_000, 120_000, 2);
    const payments = outputs.filter((o: any) => o.address === SP);
    expect(payments.length).toBeGreaterThanOrEqual(2);
    expect(payments.reduce((a: number, o: any) => a + o.value, 0)).toBe(500_000);
  });

  it('change outputs use distinct internal addresses (no reuse)', async () => {
    const w = makeWallet();
    const { outputs, changeAddresses } = await (w as any).planSplitTransaction(SP, 300_000, 5_000_000, 2);
    const changeOuts = outputs.filter((o: any) => o.address !== SP);
    expect(changeOuts.length).toBe(changeAddresses.length);
    expect(new Set(changeAddresses).size).toBe(changeAddresses.length);
  });

  it('returns a single payment output when not splittable', async () => {
    const w = makeWallet();
    const { outputs } = await (w as any).planSplitTransaction(SP, 60_000, 0, 500);
    const payments = outputs.filter((o: any) => o.address === SP);
    expect(payments).toEqual([{ address: SP, value: 60_000 }]);
  });

  it('splits at high fee rates if change is sufficient to fund extra output', async () => {
    const w = makeWallet();
    const funded = await (w as any).planSplitTransaction(SP, 500_000, 200_000, 50, 2);
    const fundedPayments = funded.outputs.filter((o: any) => o.address === SP);
    expect(fundedPayments.length).toBeGreaterThanOrEqual(2);
  });
});

describe('createTransaction (Case 2: plain, non-SP-tagged UTXOs) with splitPayment', () => {
  // Same fixture as hd-taproot-wallet.test.ts, so ext_0 is a known-good, signable P2TR address.
  const TAPROOT_MNEMONIC = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo glue';
  // Real BIP-352 test vector (see spSenderDerivation.test.ts) so bech32m decoding succeeds end-to-end.
  const SP_ADDRESS = 'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';
  const regularUtxoBase = {
    height: 0,
    value: 500_000,
    address: 'bc1p4mc3hspc535vj2d9qcjmtynllv38u0lvfp8gs8npt64ejgtxszuq6t4ckj', // ext_0 of TAPROOT_MNEMONIC
    txid: 'e97f982766537c5330b50ef521bbcd8811971eb7cc9fd64bda45266136f27b82',
    vout: 0,
  };

  function makeRegularWallet(): HDSilentPaymentsWallet {
    const w = new HDSilentPaymentsWallet();
    w.setSecret(TAPROOT_MNEMONIC);
    return w;
  }

  // real fetched UTXOs carry .wif (populated at fetch time, see _fetchUtxo); the
  // parent's sp1-resolution path requires it, so replicate that here.
  function withWif(w: HDSilentPaymentsWallet) {
    return {
      ...regularUtxoBase,
      wif: w._getWifForAddress(regularUtxoBase.address),
    };
  }

  it('splits and signs a payment to an sp1 recipient funded by plain P2TR UTXOs', async () => {
    const w = makeRegularWallet();
    const result: any = await w.createTransaction(
      [withWif(w) as any],
      [{ address: SP_ADDRESS, value: 150_000 }],
      1,
      w._getInternalAddressByIndex(0),
      undefined,
      false,
      0,
      true, // splitPayment
    );

    expect(result.tx).toBeDefined(); // standard BIP-86 tweak + signTaprootInput succeeded
    const changeSet = new Set(result.changeAddresses);
    const paymentOutputs = result.outputs.filter((o: any) => !changeSet.has(o.address));
    expect(paymentOutputs.length).toBeGreaterThanOrEqual(2); // actually split, not a silent no-op
    expect(paymentOutputs.reduce((a: number, o: any) => a + o.value, 0)).toBe(150_000);
    expect(new Set(paymentOutputs.map((o: any) => o.address)).size).toBe(paymentOutputs.length); // BIP-352 k-increment gives distinct addresses
  });

  it('falls back to a plain single-output send when the payment is too small to split', async () => {
    const w = makeRegularWallet();
    const result: any = await w.createTransaction(
      [withWif(w) as any],
      [{ address: SP_ADDRESS, value: 10_000 }], // below the economic floor
      1,
      w._getInternalAddressByIndex(0),
      undefined,
      false,
      0,
      true, // splitPayment requested, but planner should decline
    );

    expect(result.tx).toBeDefined();
    expect(result.outputs).toHaveLength(2); // 1 payment + 1 change, same as a non-split send
  });
});

describe('createTransaction (Case 1: SP-tagged UTXOs) with splitPayment', () => {
  const SP_ADDRESS = 'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';

  it('splits and signs a payment to an sp1 recipient funded by SP UTXOs', async () => {
    const w = makeWallet();

    const spendPubKey = w.getSpendPublicKey();
    const tweak = new Uint8Array(32);
    tweak[31] = 0x07;
    // @ts-ignore: required for tests
    const ecc = require('../../modules/noble_ecc').default;
    // @ts-ignore: required for tests
    const bitcoin = require('bitcoinjs-lib');
    const tweakedPub = ecc.pointAddScalar(spendPubKey, tweak, true)!;
    const expectedOutputKey = Buffer.from(tweakedPub.subarray(1, 33));
    const p2trAddress = bitcoin.payments.p2tr({
      pubkey: expectedOutputKey,
    }).address!;

    const spUtxo = {
      txid: '1111111111111111111111111111111111111111111111111111111111111111',
      vout: 0,
      value: 500_000,
      tweak,
      address: p2trAddress,
      pubKey: expectedOutputKey.toString('hex'),
    };

    const result: any = await w.createTransaction(
      [spUtxo as any],
      [{ address: SP_ADDRESS, value: 150_000 }],
      1,
      w._getInternalAddressByIndex(0),
      undefined,
      false,
      0,
      true, // splitPayment
    );

    expect(result.tx).toBeDefined();
    const changeSet = new Set(result.changeAddresses);
    const paymentOutputs = result.outputs.filter((o: any) => !changeSet.has(o.address));
    expect(paymentOutputs.length).toBeGreaterThanOrEqual(2);
    expect(paymentOutputs.reduce((a: number, o: any) => a + o.value, 0)).toBe(150_000);
    expect(new Set(paymentOutputs.map((o: any) => o.address)).size).toBe(paymentOutputs.length);
  });
});

describe('obfuscateUnnecessaryInputHeuristic', () => {
  it('does not obfuscate if feeRate >= 10', () => {
    const w = makeWallet();
    const inputs = [
      { txid: '1', vout: 0, value: 1000 },
      { txid: '2', vout: 0, value: 1000 },
    ] as any;
    const rawOutputs = [{ address: 'sp1', value: 1500 }, { value: 500 }] as any;
    const available = [{ txid: '3', vout: 0, value: 5000, height: 1, address: 'a' }];

    const res = (w as any).obfuscateUnnecessaryInputHeuristic(inputs, rawOutputs, available, 10);
    expect(res.inputs).toHaveLength(2);
    expect(res.rawOutputs).toEqual(rawOutputs);
  });

  it('does not obfuscate if inputs <= 1', () => {
    const w = makeWallet();
    const inputs = [{ txid: '1', vout: 0, value: 1000 }] as any;
    const rawOutputs = [{ address: 'sp1', value: 500 }, { value: 500 }] as any;
    const available = [{ txid: '2', vout: 0, value: 5000, height: 1, address: 'a' }];

    const res = (w as any).obfuscateUnnecessaryInputHeuristic(inputs, rawOutputs, available, 5);
    expect(res.inputs).toHaveLength(1);
    expect(res.rawOutputs).toEqual(rawOutputs);
  });

  it('pulls in more inputs to make changeValue > maxInputValue', () => {
    const w = makeWallet();
    const inputs = [
      { txid: '1', vout: 0, value: 5000 },
      { txid: '2', vout: 0, value: 3000 },
    ] as any;
    // max input value is 5000, current change is 4000
    const rawOutputs = [{ address: 'sp1', value: 4000 }, { value: 4000 }] as any;
    const available = [{ txid: '3', vout: 0, value: 2000, height: 1, address: 'a' }];

    const res = (w as any).obfuscateUnnecessaryInputHeuristic(inputs, rawOutputs, available, 5);

    expect(res.inputs).toHaveLength(3);
    expect(res.inputs[2].txid).toBe('3');

    const newChange = res.rawOutputs.find((o: any) => !o.address)?.value;
    expect(newChange).toBeGreaterThan(5000); // Exceeds the max input value to break heuristic
  });
});
