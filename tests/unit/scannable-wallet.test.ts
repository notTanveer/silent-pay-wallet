import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet.ts';

describe('HDSilentPaymentsWallet scan-control surface', () => {
  const SCAN_METHODS = [
    'getScanState',
    'setOnScanStateChangeCallback',
    'pauseScan',
    'resumeScan',
    'cancelScan',
    'isScanActive',
    'fetchTransactions',
  ] as const;

  it.each(SCAN_METHODS)('exposes %s()', method => {
    const wallet = new HDSilentPaymentsWallet();
    expect(typeof (wallet as unknown as Record<string, unknown>)[method]).toBe('function');
  });

  it('reports no active scan on a freshly constructed wallet', () => {
    const wallet = new HDSilentPaymentsWallet();
    expect(wallet.isScanActive()).toBe(false);
  });
});
