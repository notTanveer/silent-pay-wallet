import assert from 'assert';
import { renderHook } from '@testing-library/react-native';

import { useDeleteWallet } from '../../hooks/useDeleteWallet';
import { useStorage } from '../../hooks/context/useStorage';
import { useBiometrics, unlockWithBiometrics } from '../../hooks/useBiometrics';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import presentAlert from '../../components/Alert';

jest.mock('../../hooks/context/useStorage');
jest.mock('../../hooks/useBiometrics');
jest.mock('../../hooks/useExtendedNavigation');
jest.mock('../../components/Alert');

const mockUseStorage = useStorage as jest.Mock;
const mockUseBiometrics = useBiometrics as jest.Mock;
const mockUnlockWithBiometrics = unlockWithBiometrics as jest.Mock;
const mockUseExtendedNavigation = useExtendedNavigation as jest.Mock;
const mockPresentAlert = presentAlert as jest.Mock;

describe('unit - useDeleteWallet', () => {
  const wallet = { getID: () => 'wallet-id' };
  let handleWalletDeletion: jest.Mock;
  let isBiometricUseCapableAndEnabled: jest.Mock;
  let dispatch: jest.Mock;

  beforeEach(() => {
    handleWalletDeletion = jest.fn().mockResolvedValue(true);
    isBiometricUseCapableAndEnabled = jest.fn().mockResolvedValue(false);
    dispatch = jest.fn();

    mockUseStorage.mockReturnValue({ wallets: [wallet], handleWalletDeletion });
    mockUseBiometrics.mockReturnValue({ isBiometricUseCapableAndEnabled });
    mockUseExtendedNavigation.mockReturnValue({ dispatch });
    mockUnlockWithBiometrics.mockReset();
    mockPresentAlert.mockReset();
  });

  const getDestructiveButtonPress = () => {
    const { result } = renderHook(() => useDeleteWallet());
    result.current();

    const { buttons } = mockPresentAlert.mock.calls[0][0];
    return { buttons, destructive: buttons.find((b: any) => b.style === 'destructive') };
  };

  it('cancel button has no handler, so cancelling deletes nothing', () => {
    const { buttons } = getDestructiveButtonPress();
    const cancel = buttons.find((b: any) => b.style === 'cancel');

    assert.strictEqual(cancel.onPress, undefined);
    assert.strictEqual(handleWalletDeletion.mock.calls.length, 0);
  });

  it('does not delete when biometrics is enabled but auth fails', async () => {
    isBiometricUseCapableAndEnabled.mockResolvedValue(true);
    mockUnlockWithBiometrics.mockResolvedValue(false);

    const { destructive } = getDestructiveButtonPress();
    await destructive.onPress();

    assert.strictEqual(handleWalletDeletion.mock.calls.length, 0);
    assert.strictEqual(dispatch.mock.calls.length, 0);
  });

  it('deletes and resets navigation on success', async () => {
    isBiometricUseCapableAndEnabled.mockResolvedValue(false);
    handleWalletDeletion.mockResolvedValue(true);

    const { destructive } = getDestructiveButtonPress();
    await destructive.onPress();

    assert.strictEqual(handleWalletDeletion.mock.calls[0][0], 'wallet-id');
    assert.strictEqual(dispatch.mock.calls.length, 1);
    assert.deepStrictEqual(dispatch.mock.calls[0][0], {
      type: 'RESET',
      payload: { index: 0, routes: [{ name: 'Onboarding' }] },
    });
  });

  it('deletes and resets navigation when biometrics is enabled and auth succeeds', async () => {
    isBiometricUseCapableAndEnabled.mockResolvedValue(true);
    mockUnlockWithBiometrics.mockResolvedValue(true);
    handleWalletDeletion.mockResolvedValue(true);

    const { destructive } = getDestructiveButtonPress();
    await destructive.onPress();

    assert.strictEqual(handleWalletDeletion.mock.calls[0][0], 'wallet-id');
    assert.strictEqual(dispatch.mock.calls.length, 1);
  });

  it('does not reset navigation when wallet deletion fails', async () => {
    isBiometricUseCapableAndEnabled.mockResolvedValue(false);
    handleWalletDeletion.mockResolvedValue(false);

    const { destructive } = getDestructiveButtonPress();
    await destructive.onPress();

    assert.strictEqual(handleWalletDeletion.mock.calls.length, 1);
    assert.strictEqual(dispatch.mock.calls.length, 0);
  });
});
