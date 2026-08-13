import Shortcuts from '@rn-org/react-native-shortcuts';

export const WALLET_BALANCE_SHORTCUT_ID = 'view-wallet-balance';

export const registerWalletBalanceShortcut = async (title: string): Promise<void> => {
  try {
    const supported = await Shortcuts.isShortcutSupported();
    if (!supported) return;
    if (await Shortcuts.isShortcutExists(WALLET_BALANCE_SHORTCUT_ID)) {
      await Shortcuts.updateShortcut({ id: WALLET_BALANCE_SHORTCUT_ID, title });
      return;
    }
    await Shortcuts.addShortcut({ id: WALLET_BALANCE_SHORTCUT_ID, title });
  } catch (e) {
    console.error('Error registering wallet balance shortcut:', e);
  }
};

export const unregisterWalletBalanceShortcut = async (): Promise<void> => {
  try {
    const supported = await Shortcuts.isShortcutSupported();
    if (!supported) return;
    await Shortcuts.removeShortcut(WALLET_BALANCE_SHORTCUT_ID);
  } catch (e) {
    console.error('Error removing wallet balance shortcut:', e);
  }
};

export const getInitialShortcutId = async (): Promise<string | null> => {
  try {
    return await Shortcuts.getInitialShortcutId();
  } catch (e) {
    console.error('Error getting initial shortcut id:', e);
    return null;
  }
};

export const addOnShortcutUsedListener = (callback: (id: string) => void) => Shortcuts.addOnShortcutUsedListener(callback);
