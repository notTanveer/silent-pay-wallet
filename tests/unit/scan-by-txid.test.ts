import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';
import { AbstractHDElectrumWallet } from '../../class/wallets/abstract-hd-electrum-wallet.ts';

jest.mock('../../modules/Electrum', () => ({
  ...jest.requireActual('../../modules/Electrum'),
  estimateCurrentBlockheight: jest.fn(() => 850000),
}));

const SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TXID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OWNED_ADDRESS = 'bc1p-owned-address';

const SP_HIT = { found: true, utxosFound: 1, blockHeight: 800100, tipHeight: 800200 };
const SP_MISS = { found: false, utxosFound: 0, blockHeight: 800100, tipHeight: 800200 };
const REGULAR_HIT = { found: true, utxosFound: 2, blockHeight: 849998, tipHeight: 850000 };
const REGULAR_MISS = { found: false, utxosFound: 0, blockHeight: 0, tipHeight: 0 };
const NOT_FOUND = { found: false, utxosFound: 0, blockHeight: 0, tipHeight: 0 };

function makeWallet(): HDSilentPaymentsWallet {
  const wallet = new HDSilentPaymentsWallet();
  wallet.setSecret(SEED);
  return wallet;
}

describe('scanByTxid merge of SP and regular branches', () => {
  afterEach(() => jest.restoreAllMocks());

  function stubBranches(wallet: HDSilentPaymentsWallet, sp: unknown, regular: unknown) {
    const stub = (name: string, outcome: unknown) => {
      const spy = jest.spyOn(wallet as any, name);
      if (outcome instanceof Error) spy.mockRejectedValue(outcome);
      else spy.mockResolvedValue(outcome);
      return spy;
    };
    return { spSpy: stub('scanTxidForSilentPayment', sp), regularSpy: stub('scanTxidForRegularPayment', regular) };
  }

  it('returns not-found when both branches miss', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_MISS, REGULAR_MISS);
    expect(await wallet.scanByTxid(TXID)).toEqual(NOT_FOUND);
  });

  it('returns SP result when only SP branch hits', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, REGULAR_MISS);
    expect(await wallet.scanByTxid(TXID)).toEqual(SP_HIT);
  });

  it('returns regular result when only regular branch hits', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_MISS, REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual(REGULAR_HIT);
  });

  it('sums utxosFound and keeps SP heights when both branches hit', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual({
      found: true,
      utxosFound: SP_HIT.utxosFound + REGULAR_HIT.utxosFound,
      blockHeight: SP_HIT.blockHeight,
      tipHeight: SP_HIT.tipHeight,
    });
  });

  it('still finds a regular payment when the SP branch throws', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, new Error('indexer down'), REGULAR_HIT);
    expect(await wallet.scanByTxid(TXID)).toEqual(REGULAR_HIT);
  });

  it('still finds an SP payment when the regular branch throws', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, SP_HIT, new Error('electrum down'));
    expect(await wallet.scanByTxid(TXID)).toEqual(SP_HIT);
  });

  it('returns not-found without throwing when both branches throw', async () => {
    const wallet = makeWallet();
    stubBranches(wallet, new Error('indexer down'), new Error('electrum down'));
    expect(await wallet.scanByTxid(TXID)).toEqual(NOT_FOUND);
  });

  it('awaits the SP branch before starting the regular branch', async () => {
    const wallet = makeWallet();
    let spCompleted = false;
    let spCompletedWhenRegularStarted = false;
    const { spSpy, regularSpy } = stubBranches(wallet, SP_MISS, REGULAR_MISS);
    spSpy.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      spCompleted = true;
      return SP_MISS;
    });
    regularSpy.mockImplementation(async () => {
      spCompletedWhenRegularStarted = spCompleted;
      return REGULAR_MISS;
    });
    await wallet.scanByTxid(TXID);
    expect(regularSpy).toHaveBeenCalled();
    expect(spCompletedWhenRegularStarted).toBe(true);
  });
});

describe('scanByTxid regular branch', () => {
  afterEach(() => jest.restoreAllMocks());

  function makeRegularTx(overrides: Record<string, unknown> = {}) {
    return {
      txid: TXID,
      hash: TXID,
      confirmations: 3,
      value: 150000,
      inputs: [],
      outputs: [
        { n: 0, value: 0.0015, scriptPubKey: { addresses: [OWNED_ADDRESS] } },
        { n: 1, value: 0.5, scriptPubKey: { addresses: ['bc1p-someone-elses-change'] } },
      ],
      ...overrides,
    } as any;
  }

  function setupRegularBranch(txs: any[]) {
    const fetchBalance = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchBalance').mockResolvedValue();
    const fetchTransactions = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchTransactions').mockResolvedValue();
    const fetchUtxo = jest.spyOn(AbstractHDElectrumWallet.prototype, 'fetchUtxo').mockResolvedValue();
    jest.spyOn(AbstractHDElectrumWallet.prototype, 'getTransactions').mockReturnValue(txs);
    jest.spyOn(AbstractHDElectrumWallet.prototype, 'weOwnAddress').mockImplementation((address: string) => address === OWNED_ADDRESS);

    const wallet = makeWallet();
    jest.spyOn(wallet as any, 'scanTxidForSilentPayment').mockResolvedValue(SP_MISS);
    return { wallet, fetchBalance, fetchTransactions, fetchUtxo };
  }

  it('finds an incoming payment to an owned address and counts only our outputs', async () => {
    const { wallet, fetchBalance, fetchTransactions, fetchUtxo } = setupRegularBranch([makeRegularTx()]);

    const result = await wallet.scanByTxid(TXID);

    expect(result).toEqual({
      found: true,
      utxosFound: 1,
      blockHeight: 850000 - 3 + 1,
      tipHeight: 850000,
    });
    expect(fetchBalance).toHaveBeenCalled();
    expect(fetchTransactions).toHaveBeenCalled();
    expect(fetchUtxo).toHaveBeenCalled();
  });

  it('reports blockHeight 0 for an unconfirmed payment', async () => {
    const { wallet } = setupRegularBranch([makeRegularTx({ confirmations: 0 })]);

    const result = await wallet.scanByTxid(TXID);

    expect(result.found).toBe(true);
    expect(result.blockHeight).toBe(0);
    expect(result.tipHeight).toBe(850000);
  });

  it('does not report an outgoing transaction as a payment', async () => {
    const { wallet } = setupRegularBranch([makeRegularTx({ value: -50000 })]);
    expect(await wallet.scanByTxid(TXID)).toEqual(NOT_FOUND);
  });

  it('does not report a transaction the wallet does not know after a sync', async () => {
    const { wallet, fetchTransactions } = setupRegularBranch([]);
    expect(await wallet.scanByTxid(TXID)).toEqual(NOT_FOUND);
    expect(fetchTransactions).toHaveBeenCalled();
  });
});
