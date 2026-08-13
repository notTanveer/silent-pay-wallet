import assert from 'assert';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useWalletShortcuts } from '../../hooks/useWalletShortcuts';
import { useSettings } from '../../hooks/context/useSettings';
import { useStorage } from '../../hooks/context/useStorage';
import * as NavigationService from '../../NavigationService';
import {
  registerWalletBalanceShortcut,
  unregisterWalletBalanceShortcut,
  getInitialShortcutId,
  addOnShortcutUsedListener,
  WALLET_BALANCE_SHORTCUT_ID,
} from '../../modules/walletShortcuts';
import loc from '../../loc';

jest.mock('../../hooks/context/useSettings');
jest.mock('../../hooks/context/useStorage');
jest.mock('../../NavigationService');
jest.mock('../../modules/walletShortcuts');

const mockUseSettings = useSettings as jest.Mock;
const mockUseStorage = useStorage as jest.Mock;
const mockNavigate = NavigationService.navigate as jest.Mock;
const mockOnNavigationReady = NavigationService.onNavigationReady as jest.Mock;
const mockRegister = registerWalletBalanceShortcut as jest.Mock;
const mockUnregister = unregisterWalletBalanceShortcut as jest.Mock;
const mockGetInitialShortcutId = getInitialShortcutId as jest.Mock;
const mockAddOnShortcutUsedListener = addOnShortcutUsedListener as jest.Mock;

describe('unit - useWalletShortcuts', () => {
  const remove = jest.fn();

  beforeEach(() => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: true, settingsLoaded: true });
    mockUseStorage.mockReturnValue({ wallets: [{ getID: () => 'wallet-id' }] });
    mockNavigate.mockReset();
    mockOnNavigationReady.mockReset().mockImplementation((callback: () => void) => callback());
    mockRegister.mockReset();
    mockUnregister.mockReset();
    mockGetInitialShortcutId.mockReset().mockResolvedValue('');
    mockAddOnShortcutUsedListener.mockReset().mockReturnValue({ remove });
    remove.mockReset();
  });

  it('registers the shortcut when enabled', () => {
    renderHook(() => useWalletShortcuts());

    assert.strictEqual(mockRegister.mock.calls.length, 1);
    assert.strictEqual(mockRegister.mock.calls[0][0], loc.settings.general_wallet_shortcuts_action_title);
    assert.strictEqual(mockUnregister.mock.calls.length, 0);
  });

  it('unregisters the shortcut when disabled', () => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: false, settingsLoaded: true });

    renderHook(() => useWalletShortcuts());

    assert.strictEqual(mockUnregister.mock.calls.length, 1);
    assert.strictEqual(mockRegister.mock.calls.length, 0);
  });

  it('does not register or unregister before the persisted value has loaded', () => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: true, settingsLoaded: false });

    renderHook(() => useWalletShortcuts());

    assert.strictEqual(mockRegister.mock.calls.length, 0);
    assert.strictEqual(mockUnregister.mock.calls.length, 0);
  });

  it('navigates to WalletsList when the shortcut fires and a wallet exists', () => {
    renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    handleShortcut(WALLET_BALANCE_SHORTCUT_ID);

    assert.strictEqual(mockNavigate.mock.calls.length, 1);
    assert.strictEqual(mockNavigate.mock.calls[0][0], 'WalletsList');
  });

  it('does not navigate when the shortcut fires while wallet shortcuts are disabled', () => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: false, settingsLoaded: true });

    renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    handleShortcut(WALLET_BALANCE_SHORTCUT_ID);

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('does not navigate when the shortcut fires before settings have loaded', () => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: true, settingsLoaded: false });

    renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    handleShortcut(WALLET_BALANCE_SHORTCUT_ID);

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('stops navigating once wallet shortcuts are toggled off after mount', () => {
    const { rerender } = renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: false, settingsLoaded: true });
    rerender({});

    handleShortcut(WALLET_BALANCE_SHORTCUT_ID);

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('does not navigate on a cold launch when wallet shortcuts are disabled', async () => {
    mockUseSettings.mockReturnValue({ isWalletShortcutsEnabled: false, settingsLoaded: true });
    mockGetInitialShortcutId.mockResolvedValue(WALLET_BALANCE_SHORTCUT_ID);

    renderHook(() => useWalletShortcuts());

    await waitFor(() => assert.strictEqual(mockGetInitialShortcutId.mock.calls.length, 1));
    await Promise.resolve();

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('does not navigate when the shortcut fires but no wallet exists', () => {
    mockUseStorage.mockReturnValue({ wallets: [] });

    renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    handleShortcut(WALLET_BALANCE_SHORTCUT_ID);

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('does not navigate for an unrelated shortcut id', () => {
    renderHook(() => useWalletShortcuts());
    const handleShortcut = mockAddOnShortcutUsedListener.mock.calls[0][0];

    handleShortcut('some-other-shortcut');

    assert.strictEqual(mockNavigate.mock.calls.length, 0);
  });

  it('navigates on a cold launch when the initial shortcut id matches', async () => {
    mockGetInitialShortcutId.mockResolvedValue(WALLET_BALANCE_SHORTCUT_ID);

    renderHook(() => useWalletShortcuts());

    await waitFor(() => assert.strictEqual(mockNavigate.mock.calls.length, 1));
    assert.strictEqual(mockNavigate.mock.calls[0][0], 'WalletsList');
  });

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useWalletShortcuts());
    unmount();

    assert.strictEqual(remove.mock.calls.length, 1);
  });
});
