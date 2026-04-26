import loc from '../loc';
import { HDSilentPaymentsWallet } from '.';
import type { TWallet } from './wallets/types';

export const validateBip32 = (path: string) => path.match(/^(m\/)?(\d+'?\/)*\d+'?$/) !== null;

type TStatus = {
  cancelled: boolean;
  stopped: boolean;
  wallets: TWallet[];
};

export type TImport = {
  promise: Promise<TStatus>;
  stop: () => void;
};

const startImport = (
  importTextOrig: string,
  askPassphrase: boolean = false,
  _searchAccounts: boolean = false,
  offline: boolean = false,
  onProgress: (name: string) => void,
  onWallet: (wallet: TWallet) => void,
  onPassword: (title: string, text: string) => Promise<string>,
): TImport => {
  let promiseResolve: (arg: TStatus) => void;
  let promiseReject: (reason?: any) => void;
  let running = true;
  const wallets: TWallet[] = [];

  const promise = new Promise<TStatus>((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
  });

  const reportProgress = (name: string) => {
    onProgress(name);
  };

  const reportFinish = (cancelled: boolean = false, stopped: boolean = false) => {
    promiseResolve({ cancelled, stopped, wallets });
  };

  const reportWallet = (wallet: TWallet) => {
    if (wallets.some(existingWallet => existingWallet.getID() === wallet.getID())) return;
    wallets.push(wallet);
    onWallet(wallet);
  };

  const stop = () => {
    running = false;
  };

  async function* importGenerator() {
    const text = importTextOrig.trim();
    const wallet = new HDSilentPaymentsWallet();
    wallet.setSecret(text);

    if (!wallet.validateMnemonic()) {
      throw new Error('Only BIP39 mnemonics for HD Silent Payments wallets are supported.');
    }

    if (askPassphrase) {
      const password = await onPassword(loc.wallets.import_passphrase_title, loc.wallets.import_passphrase_message);
      if (password) {
        wallet.setPassphrase(password);
      }
    }

    yield { progress: 'silent payments' };

    if (!offline) {
      try {
        await wallet.fetchBalance();
      } catch (error) {
        console.warn('[wallet-import] Failed to fetch wallet balance during import:', error);
      }

      try {
        await wallet.fetchTransactions();
      } catch (error) {
        console.warn('[wallet-import] Failed to fetch wallet transactions during import:', error);
      }
    }

    yield { wallet };
  }

  (async () => {
    const generator = importGenerator();
    while (true) {
      const next = await generator.next();
      if (!running) throw new Error('Discovery stopped');
      if (next.value?.progress) reportProgress(next.value.progress);
      if (next.value?.wallet) reportWallet(next.value.wallet);
      if (next.done) break;
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    reportFinish();
  })().catch(error => {
    if (error.message === 'Cancel Pressed') {
      reportFinish(true);
      return;
    }

    if (error.message === 'Discovery stopped') {
      reportFinish(undefined, true);
      return;
    }

    promiseReject(error);
  });

  return { promise, stop };
};

export default startImport;
