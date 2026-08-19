import * as Electrum from '../../modules/Electrum';
import { HDSilentPaymentsWallet, OwnedOutput } from '../../class/wallets/hd-bip352-wallet.ts';
import { AbstractHDElectrumWallet } from '../../class/wallets/abstract-hd-electrum-wallet.ts';
import ecc from '../../modules/noble_ecc';

jest.mock('../../modules/Electrum', () => ({
  ...jest.requireActual('../../modules/Electrum'),
  multiGetTransactionByTxid: jest.fn(),
}));

const SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TXID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SOMEONE_ELSE_ADDRESS = 'bc1qsomeoneelse00000000000000000000000000';

function makeWallet(): HDSilentPaymentsWallet {
  const wallet = new HDSilentPaymentsWallet();
  wallet.setSecret(SEED);
  return wallet;
}

describe('scanByTxid merge of SP and regular branches', () => {
  afterEach(() => jest.restoreAllMocks());

  const SP_HIT = { outputs: [{ vout: 0, value: 100000, kind: 'silent-payment' as const }], confirmations: 3 };
  const SP_MISS = { outputs: [], confirmations: 3 };
  const REGULAR_HIT = {
    outputs: [{ vout: 1, value: 50000, kind: 'regular' as const, address: 'bc1p-regular', isChange: false }],
    confirmations: 6,
  };
  const REGULAR_MISS = { outputs: [], confirmations: 6 };

  function stubBranches(
    wallet: HDSilentPaymentsWallet,
    sp: { outputs: OwnedOutput[]; confirmations: number } | Error,
    regular: { outputs: OwnedOutput[]; confirmations: number } | null | Error,
  ) {
    const stub = (name: string, outcome: unknown) => {
      const spy = jest.spyOn(wallet as any, name);
      if (outcome instanceof Error) spy.mockRejectedValue(outcome);
      else spy.mockResolvedValue(outcome);
      return spy;
    };
    return {
      spSpy: stub('scanTxidForSilentPayment', sp),
      detectSpy: stub('detectRegularOutputs', regular),
      ingestSpy: jest.spyOn(wallet as any, 'ingestRegularOutputs').mockResolvedValue(undefined),
    };
  }

  it('returns not-found when both branches miss', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_MISS, REGULAR_MISS);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: false,
      outputs: [],
      totalValue: 0,
      confirmations: REGULAR_MISS.confirmations,
      bothBranchesFailed: false,
    });
  });

  it('returns the SP outputs when only the SP branch hits, but prefers the regular branch real confirmations', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, REGULAR_MISS);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: SP_HIT.outputs,
      totalValue: 100000,
      confirmations: REGULAR_MISS.confirmations, // Electrum's real confirmations win over the indexer approximation
      bothBranchesFailed: false,
    });
  });

  it('returns both outputs when the SP branch reports two outputs in the same tx', async () => {
    const wallet = makeWallet();
    const spOutputs = [
      { vout: 0, value: 60000, kind: 'silent-payment' as const },
      { vout: 2, value: 40000, kind: 'silent-payment' as const },
    ];
    stubBranches(wallet, { outputs: spOutputs, confirmations: 3 }, REGULAR_MISS);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: spOutputs,
      totalValue: 100000,
      confirmations: REGULAR_MISS.confirmations,
      bothBranchesFailed: false,
    });
  });

  it('returns the regular outputs and ingests them when only the regular branch hits', async () => {
    const wallet = makeWallet();
    const { ingestSpy } = stubBranches(wallet, SP_MISS, REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: REGULAR_HIT.outputs,
      totalValue: 50000,
      confirmations: REGULAR_HIT.confirmations,
      bothBranchesFailed: false,
    });
    expect(ingestSpy).toHaveBeenCalledWith(REGULAR_HIT.outputs);
  });

  it('merges outputs from both branches when a tx pays an SP output and a regular output', async () => {
    const wallet = makeWallet();
    const { ingestSpy } = stubBranches(wallet, SP_HIT, REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: [...SP_HIT.outputs, ...REGULAR_HIT.outputs],
      totalValue: 150000,
      confirmations: REGULAR_HIT.confirmations,
      bothBranchesFailed: false,
    });
    expect(ingestSpy).toHaveBeenCalledWith(REGULAR_HIT.outputs);
  });

  it('dedupes an output both branches report for the same vout, keeping the regular-branch entry', async () => {
    const wallet = makeWallet();
    const spOutput: OwnedOutput = { vout: 0, value: 100000, kind: 'silent-payment' };
    const regularOutput: OwnedOutput = { vout: 0, value: 100000, kind: 'regular', address: 'bc1p-owned', isChange: false };
    stubBranches(wallet, { outputs: [spOutput], confirmations: 3 }, { outputs: [regularOutput], confirmations: 6 });

    const result = await wallet.scanByTxid(TXID);

    expect(result.outputs).toEqual([regularOutput]);
    expect(result.totalValue).toBe(100000);
  });

  it('does not ingest when the regular branch detects the tx but finds no owned output', async () => {
    const wallet = makeWallet();
    const { ingestSpy } = stubBranches(wallet, SP_MISS, REGULAR_MISS);
    await wallet.scanByTxid(TXID);
    expect(ingestSpy).not.toHaveBeenCalled();
  });

  it('still finds a regular payment when the SP branch throws', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, new Error('indexer down'), REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: REGULAR_HIT.outputs,
      totalValue: 50000,
      confirmations: REGULAR_HIT.confirmations,
      bothBranchesFailed: false,
    });
  });

  it('still finds an SP payment when the regular branch throws, falling back to indexer confirmations', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, new Error('electrum down'));
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: SP_HIT.outputs,
      totalValue: 100000,
      confirmations: SP_HIT.confirmations,
      bothBranchesFailed: false,
    });
  });

  it('still finds an SP payment when Electrum does not know the txid at all', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, null);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      outputs: SP_HIT.outputs,
      totalValue: 100000,
      confirmations: SP_HIT.confirmations,
      bothBranchesFailed: false,
    });
  });

  it('returns not-found without throwing when both branches throw', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, new Error('indexer down'), new Error('electrum down'));
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: false,
      outputs: [],
      totalValue: 0,
      confirmations: 0,
      bothBranchesFailed: true,
    });
  });

  it('awaits the SP branch before starting the regular branch', async () => {
    const wallet = makeWallet();
    let spCompleted = false;
    let spCompletedWhenRegularStarted = false;
    const { spSpy, detectSpy } = stubBranches(wallet, SP_MISS, REGULAR_MISS);
    spSpy.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      spCompleted = true;
      return SP_MISS;
    });
    detectSpy.mockImplementation(async () => {
      spCompletedWhenRegularStarted = spCompleted;
      return REGULAR_MISS;
    });
    await wallet.scanByTxid(TXID);
    expect(detectSpy).toHaveBeenCalled();
    expect(spCompletedWhenRegularStarted).toBe(true);
  });
});

describe('detectRegularOutputs', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockElectrumTx(tx: Record<string, unknown> | null) {
    (Electrum.multiGetTransactionByTxid as jest.Mock).mockResolvedValue(tx ? { [TXID]: tx } : {});
  }

  function makeElectrumTx(vout: Array<{ n: number; value: number; address?: string }>, overrides: Record<string, unknown> = {}) {
    return {
      txid: TXID,
      hash: TXID,
      confirmations: 3,
      vin: [],
      vout: vout.map(o => ({ n: o.n, value: o.value, scriptPubKey: { addresses: o.address ? [o.address] : [] } })),
      ...overrides,
    };
  }

  it('finds two owned regular outputs in the same tx and ignores a third that is not ours', async () => {
    const wallet = makeWallet();
    const addr0 = (wallet as any)._getExternalAddressByIndex(0);
    const addr1 = (wallet as any)._getExternalAddressByIndex(1);
    mockElectrumTx(
      makeElectrumTx([
        { n: 0, value: 0.001, address: addr0 },
        { n: 1, value: 0.002, address: addr1 },
        { n: 2, value: 0.5, address: SOMEONE_ELSE_ADDRESS },
      ]),
    );

    const result = await (wallet as any).detectRegularOutputs(TXID);

    expect(result.outputs).toEqual([
      { vout: 0, value: 100000, kind: 'regular', address: addr0, isChange: false },
      { vout: 1, value: 200000, kind: 'regular', address: addr1, isChange: false },
    ]);
    expect(result.confirmations).toBe(3);
  });

  it('flags an owned output on the internal chain as change', async () => {
    const wallet = makeWallet();
    const changeAddr = (wallet as any)._getInternalAddressByIndex(0);
    mockElectrumTx(makeElectrumTx([{ n: 0, value: 0.0003, address: changeAddr }]));

    const result = await (wallet as any).detectRegularOutputs(TXID);

    expect(result.outputs).toEqual([{ vout: 0, value: 30000, kind: 'regular', address: changeAddr, isChange: true }]);
  });

  it('detects our output even when the tx also spends a larger UTXO of ours, netting negative', async () => {
    // detectRegularOutputs works output-by-output against Electrum directly, so unlike the old
    // getTransactions().find() + tx.value > 0 approach, it isn't fooled by a tx whose overall net
    // wallet value is negative because it also spends one of our own (larger) inputs.
    const wallet = makeWallet();
    const addr0 = (wallet as any)._getExternalAddressByIndex(0);
    mockElectrumTx(
      makeElectrumTx([
        { n: 0, value: 0.5, address: addr0 },
        { n: 1, value: 1.2999, address: SOMEONE_ELSE_ADDRESS },
      ]),
    );

    const result = await (wallet as any).detectRegularOutputs(TXID);

    expect(result.outputs).toEqual([{ vout: 0, value: 50000000, kind: 'regular', address: addr0, isChange: false }]);
  });

  it('detects a payment to the address at next_free_address_index, one past the last known used index', async () => {
    const wallet = makeWallet();
    (wallet as any).next_free_address_index = 5;
    const matchedAddress = (wallet as any)._getExternalAddressByIndex(5);
    mockElectrumTx(makeElectrumTx([{ n: 0, value: 0.001, address: matchedAddress }]));

    const result = await (wallet as any).detectRegularOutputs(TXID);

    expect(result.outputs).toEqual([{ vout: 0, value: 100000, kind: 'regular', address: matchedAddress, isChange: false }]);
  });

  it('ignores outputs paying an address we do not own', async () => {
    const wallet = makeWallet();
    mockElectrumTx(makeElectrumTx([{ n: 0, value: 1, address: SOMEONE_ELSE_ADDRESS }]));

    const result = await (wallet as any).detectRegularOutputs(TXID);

    expect(result.outputs).toEqual([]);
  });

  it('returns null when Electrum does not know the txid', async () => {
    const wallet = makeWallet();
    mockElectrumTx(null);

    expect(await (wallet as any).detectRegularOutputs(TXID)).toBeNull();
  });
});

describe('ingestRegularOutputs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('advances the discovery frontier past a matched external index, then syncs', async () => {
    const wallet = makeWallet();
    (wallet as any).next_free_address_index = 5;
    const matchedAddress = (wallet as any)._getExternalAddressByIndex(5);

    const fetchBalance = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchBalance').mockResolvedValue();
    const fetchTransactions = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchTransactions').mockResolvedValue();
    const fetchUtxo = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchUtxo').mockResolvedValue();

    const output: OwnedOutput = { vout: 0, value: 100000, kind: 'regular', address: matchedAddress, isChange: false };
    await (wallet as any).ingestRegularOutputs([output]);

    expect((wallet as any).next_free_address_index).toBe(6);
    expect(fetchBalance).toHaveBeenCalled();
    expect(fetchTransactions).toHaveBeenCalled();
    expect(fetchUtxo).toHaveBeenCalled();
  });

  it('advances the change-chain frontier past a matched internal index', async () => {
    const wallet = makeWallet();
    (wallet as any).next_free_change_address_index = 2;
    const matchedAddress = (wallet as any)._getInternalAddressByIndex(2);

    jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchBalance').mockResolvedValue();
    jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchTransactions').mockResolvedValue();
    jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchUtxo').mockResolvedValue();

    const output: OwnedOutput = { vout: 0, value: 30000, kind: 'regular', address: matchedAddress, isChange: true };
    await (wallet as any).ingestRegularOutputs([output]);

    expect((wallet as any).next_free_change_address_index).toBe(3);
  });
});

describe('isLabelChangeOutput', () => {
  // Builds a fake SP UTXO whose pubKey is spendPub tweaked by `tweak`, the way the Rust scanner
  // would report a real match against that key.
  function makeSpUtxo(spendPub: Uint8Array, tweak: Uint8Array): any {
    const tweakedPub = ecc.pointAddScalar(spendPub, tweak, true)!;
    return {
      txid: TXID,
      vout: 0,
      value: 1000,
      height: 0,
      address: '',
      silentPaymentAddress: '',
      pubKey: Buffer.from(tweakedPub.subarray(1, 33)).toString('hex'),
      tweak,
      blockHash: '',
      isSpent: false,
      blockTime: 0,
    };
  }

  const TWEAK = new Uint8Array(32).fill(7);

  it('returns false for a UTXO that matches the main spend key', () => {
    const wallet = makeWallet();
    const [main] = (wallet as any).getSpendKeyCandidates();

    expect((wallet as any).isLabelChangeOutput(makeSpUtxo(main.spendPub, TWEAK))).toBe(false);
  });

  it('returns true for a UTXO that matches the label-0 change spend key', () => {
    const wallet = makeWallet();
    const [, change] = (wallet as any).getSpendKeyCandidates();

    expect((wallet as any).isLabelChangeOutput(makeSpUtxo(change.spendPub, TWEAK))).toBe(true);
  });

  it('returns false when the tweak reproduces neither spend key', () => {
    const wallet = makeWallet();
    const [main] = (wallet as any).getSpendKeyCandidates();
    const utxo = { ...makeSpUtxo(main.spendPub, TWEAK), pubKey: 'ff'.repeat(32) };

    expect((wallet as any).isLabelChangeOutput(utxo)).toBe(false);
  });
});
