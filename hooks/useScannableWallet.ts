import { useMemo } from 'react';
import { useStorage } from './context/useStorage';
import { isScannable, type IScannableWallet } from '../helpers/silent-payments';

/**
 * Returns the first wallet that supports background scanning (silent payments), or null.
 * Centralises the `wallets.find(isScannable)` lookup shared across the scan UI.
 */
export const useScannableWallet = (): IScannableWallet | null => {
  const { wallets } = useStorage();
  return useMemo(() => (wallets.find(isScannable) ?? null) as IScannableWallet | null, [wallets]);
};
