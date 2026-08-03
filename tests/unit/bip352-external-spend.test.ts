import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';
import * as Electrum from '../../modules/Electrum';
import { getDefaultIndexer } from '../../modules/SilentPaymentIndexer';
import { type SilentPaymentUTXO } from '../../helpers/silent-payments/types.ts';

jest.mock('../../modules/Electrum', () => ({
  isDisabled: jest.fn(),
  ping: jest.fn(),
  multiGetHistoryByAddress: jest.fn(),
  multiGetTransactionByTxid: jest.fn(),
}));

jest.mock('../../modules/SilentPaymentIndexer', () => ({
  getDefaultIndexer: jest.fn(),
}));

const mockIsDisabled = Electrum.isDisabled as jest.Mock;
const mockPing = Electrum.ping as jest.Mock;
const mockGetHistory = Electrum.multiGetHistoryByAddress as jest.Mock;
const mockGetTx = Electrum.multiGetTransactionByTxid as jest.Mock;
const mockGetDefaultIndexer = getDefaultIndexer as jest.Mock;

const FUNDING_TXID = '11'.repeat(32);
const SPENDER_TXID = '22'.repeat(32);
const UNRELATED_TXID = '33'.repeat(32);
const ADDRESS = 'bc1ptest';

function makeUtxo(overrides: Partial<SilentPaymentUTXO> = {}): SilentPaymentUTXO {
  return {
    txid: FUNDING_TXID,
    vout: 0,
    value: 10_000,
    height: 100,
    address: ADDRESS,
    silentPaymentAddress: 'sp1qtest',
    pubKey: 'aa'.repeat(32),
    tweak: new Uint8Array(32),
    blockHash: '',
    blockTime: 0,
    isSpent: false,
    ...overrides,
  };
}

// Minimal stand-in for Electrum's verbose transaction: only `vin` is read.
function spendingTx(txid: string, spends: { txid: string; vout: number }[]) {
  return { txid, vin: spends.map(s => ({ txid: s.txid, vout: s.vout })) };
}

describe('external spend detection', () => {
  let wallet: HDSilentPaymentsWallet;
  let onBalanceChange: jest.Mock;
  let onPersist: jest.Mock;

  const recheck = () => (wallet as any).recheckSpentStatusViaElectrum();
  const seed = (utxo: SilentPaymentUTXO) => (wallet as any).addUTXO(utxo);

  beforeEach(() => {
    jest.clearAllMocks();
    wallet = new HDSilentPaymentsWallet();
    onBalanceChange = jest.fn();
    onPersist = jest.fn();
    wallet.setOnBalanceChangeCallback(onBalanceChange);
    wallet.setOnPersistCallback(onPersist);

    mockIsDisabled.mockResolvedValue(false);
    mockPing.mockResolvedValue(true);
    mockGetTx.mockResolvedValue({});
  });

  it('leaves a UTXO alone when its address history holds only the funding tx', async () => {
    seed(makeUtxo());
    mockGetHistory.mockResolvedValue({ [ADDRESS]: [{ tx_hash: FUNDING_TXID, height: 100 }] });

    await recheck();

    expect(mockGetTx).not.toHaveBeenCalled();
    expect(wallet.getUTXOs()).toHaveLength(1);
    expect(wallet.getBalance()).toBe(10_000);
    expect(onBalanceChange).not.toHaveBeenCalled();
  });

  it('marks a UTXO spent when a confirmed tx spends the outpoint', async () => {
    seed(makeUtxo());
    expect(wallet.getBalance()).toBe(10_000);

    mockGetHistory.mockResolvedValue({
      [ADDRESS]: [
        { tx_hash: FUNDING_TXID, height: 100 },
        { tx_hash: SPENDER_TXID, height: 150 },
      ],
    });
    mockGetTx.mockResolvedValue({ [SPENDER_TXID]: spendingTx(SPENDER_TXID, [{ txid: FUNDING_TXID, vout: 0 }]) });

    await recheck();

    expect(wallet.getUTXOs()).toHaveLength(0);
    expect(wallet.getBalance()).toBe(0);
    expect(onBalanceChange).toHaveBeenCalled();
    expect(onPersist).toHaveBeenCalled();

    const [utxo] = (wallet as any).getSilentPaymentUTXOs() as SilentPaymentUTXO[];
    expect(utxo.isSpent).toBe(true);
    expect(utxo.spentByTxid).toBe(SPENDER_TXID);
    expect(utxo.spentHeight).toBe(150);
  });

  it('marks a UTXO spent while the spending tx is still in the mempool', async () => {
    seed(makeUtxo());
    mockGetHistory.mockResolvedValue({
      [ADDRESS]: [
        { tx_hash: FUNDING_TXID, height: 100 },
        { tx_hash: SPENDER_TXID, height: 0 },
      ],
    });
    mockGetTx.mockResolvedValue({ [SPENDER_TXID]: spendingTx(SPENDER_TXID, [{ txid: FUNDING_TXID, vout: 0 }]) });

    await recheck();

    expect(wallet.getBalance()).toBe(0);
    const [utxo] = (wallet as any).getSilentPaymentUTXOs() as SilentPaymentUTXO[];
    expect(utxo.spentHeight).toBe(0);
  });

  it('restores a UTXO whose unconfirmed spender was replaced or dropped', async () => {
    seed(makeUtxo({ isSpent: true, spentByTxid: SPENDER_TXID, spentHeight: 0 }));
    expect(wallet.getBalance()).toBe(0);

    // The replaced tx is gone; only the funding tx is left at this address.
    mockGetHistory.mockResolvedValue({ [ADDRESS]: [{ tx_hash: FUNDING_TXID, height: 100 }] });

    await recheck();

    expect(wallet.getUTXOs()).toHaveLength(1);
    expect(wallet.getBalance()).toBe(10_000);
    expect(onBalanceChange).toHaveBeenCalled();

    const [utxo] = (wallet as any).getSilentPaymentUTXOs() as SilentPaymentUTXO[];
    expect(utxo.spentByTxid).toBeUndefined();
    expect(utxo.spentHeight).toBeUndefined();
  });

  it('records the new height once an unconfirmed spender confirms', async () => {
    seed(makeUtxo({ isSpent: true, spentByTxid: SPENDER_TXID, spentHeight: 0 }));
    mockGetHistory.mockResolvedValue({
      [ADDRESS]: [
        { tx_hash: FUNDING_TXID, height: 100 },
        { tx_hash: SPENDER_TXID, height: 151 },
      ],
    });
    mockGetTx.mockResolvedValue({ [SPENDER_TXID]: spendingTx(SPENDER_TXID, [{ txid: FUNDING_TXID, vout: 0 }]) });

    await recheck();

    expect(wallet.getBalance()).toBe(0);
    const [utxo] = (wallet as any).getSilentPaymentUTXOs() as SilentPaymentUTXO[];
    expect(utxo.isSpent).toBe(true);
    expect(utxo.spentHeight).toBe(151);
  });

  it('does not mark a UTXO spent when the history lacks its funding tx', async () => {
    seed(makeUtxo());
    // Server behind, scripthash errored, or address not indexed — inconclusive, not "spent".
    mockGetHistory.mockResolvedValue({ [ADDRESS]: [] });

    await recheck();

    expect(wallet.getUTXOs()).toHaveLength(1);
    expect(wallet.getBalance()).toBe(10_000);
    expect(onBalanceChange).not.toHaveBeenCalled();
  });

  it('does not mark a UTXO spent for an unrelated tx at the same address', async () => {
    seed(makeUtxo());
    mockGetHistory.mockResolvedValue({
      [ADDRESS]: [
        { tx_hash: FUNDING_TXID, height: 100 },
        { tx_hash: UNRELATED_TXID, height: 150 },
      ],
    });
    // Spends a different outpoint of the same funding tx.
    mockGetTx.mockResolvedValue({ [UNRELATED_TXID]: spendingTx(UNRELATED_TXID, [{ txid: FUNDING_TXID, vout: 7 }]) });

    await recheck();

    expect(wallet.getUTXOs()).toHaveLength(1);
    expect(wallet.getBalance()).toBe(10_000);
  });

  it('does nothing when Electrum is disabled', async () => {
    seed(makeUtxo());
    mockIsDisabled.mockResolvedValue(true);

    await recheck();

    expect(mockGetHistory).not.toHaveBeenCalled();
    expect(wallet.getBalance()).toBe(10_000);
  });

  it('does nothing when Electrum is not connected', async () => {
    seed(makeUtxo());
    mockPing.mockResolvedValue(false);

    await recheck();

    expect(mockGetHistory).not.toHaveBeenCalled();
    expect(wallet.getBalance()).toBe(10_000);
  });

  it('throttles repeated rechecks to one network pass', async () => {
    seed(makeUtxo());
    mockGetHistory.mockResolvedValue({ [ADDRESS]: [{ tx_hash: FUNDING_TXID, height: 100 }] });

    await recheck();
    await recheck();

    expect(mockGetHistory).toHaveBeenCalledTimes(1);
  });

  it('never re-checks a UTXO the wallet itself spent', async () => {
    // Locally-broadcast spends set isSpent without spentByTxid, so they are not candidates.
    seed(makeUtxo({ isSpent: true }));

    await recheck();

    expect(mockGetHistory).not.toHaveBeenCalled();
  });
});

describe('spent recheck runs from the scan path', () => {
  let wallet: HDSilentPaymentsWallet;

  beforeEach(() => {
    jest.clearAllMocks();
    wallet = new HDSilentPaymentsWallet();
    mockIsDisabled.mockResolvedValue(false);
    mockPing.mockResolvedValue(true);
    mockGetTx.mockResolvedValue({});
    mockGetDefaultIndexer.mockReturnValue({
      getLatestBlockHeight: jest.fn().mockResolvedValue({ height: 200 }),
      scanForwardWithCallback: jest.fn(),
    });
    (wallet as any).addUTXO(makeUtxo());
    (wallet as any).lastScannedBlock = 200; // startHeight 201 > tip 200 → forward scan early-returns
  });

  it('detects an external spend even when there are no new blocks to scan', async () => {
    mockGetHistory.mockResolvedValue({
      [ADDRESS]: [
        { tx_hash: FUNDING_TXID, height: 100 },
        { tx_hash: SPENDER_TXID, height: 150 },
      ],
    });
    mockGetTx.mockResolvedValue({ [SPENDER_TXID]: spendingTx(SPENDER_TXID, [{ txid: FUNDING_TXID, vout: 0 }]) });

    await wallet.scanForPayments();

    expect(mockGetHistory).toHaveBeenCalled();
    expect(wallet.getUTXOs()).toHaveLength(0);
  });

  it('completes the scan when the recheck fails', async () => {
    mockGetHistory.mockRejectedValue(new Error('electrum boom'));

    await expect(wallet.scanForPayments()).resolves.toBe(0);
    expect(wallet.getUTXOs()).toHaveLength(1);
  });
});
