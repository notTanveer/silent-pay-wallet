import { useMemo } from 'react';
import { useStorage } from './context/useStorage';
import { TWallet } from '../class/wallets/types';

/**
 * Returns the active silent-payments wallet (the app is single-wallet), or null.
 * Centralises the lookup shared across the scan UI (WalletsList, SyncScreen).
 */
export const useScannableWallet = (): TWallet | null => {
  const { wallets } = useStorage();
  return useMemo(() => wallets[0] ?? null, [wallets]);
};
