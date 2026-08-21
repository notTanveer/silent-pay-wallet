import assert from 'assert';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ImportWallet from '../../screen/wallets/ImportWallet';
import { useStorage } from '../../hooks/context/useStorage';
import { useSettings } from '../../hooks/context/useSettings';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { getDefaultIndexer } from '../../modules/SilentPaymentIndexer';
import presentAlert from '../../components/Alert';
import loc from '../../loc';

jest.mock('../../hooks/context/useStorage');
jest.mock('../../hooks/context/useSettings');
jest.mock('../../hooks/useExtendedNavigation');
jest.mock('../../hooks/useScreenProtect', () => ({ useScreenProtect: jest.fn() }));
jest.mock('../../components/DoneAndDismissKeyboardInputAccessory', () => ({
  DoneAndDismissKeyboardInputAccessory: () => null,
  DoneAndDismissKeyboardInputAccessoryViewID: 'DoneAndDismissKeyboardInputAccessory',
}));
jest.mock('../../modules/SilentPaymentIndexer');
jest.mock('../../components/Alert');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useRoute: () => ({ params: {} }),
}));

const mockUseStorage = useStorage as jest.Mock;
const mockUseSettings = useSettings as jest.Mock;
const mockUseExtendedNavigation = useExtendedNavigation as jest.Mock;
const mockUseScreenProtect = jest.requireMock('../../hooks/useScreenProtect').useScreenProtect as jest.Mock;
const mockGetDefaultIndexer = getDefaultIndexer as jest.Mock;
const mockPresentAlert = presentAlert as jest.Mock;

const renderScreen = () =>
  render(
    <SafeAreaProvider>
      <NavigationContainer>
        <ImportWallet />
      </NavigationContainer>
    </SafeAreaProvider>,
  );

describe('unit - ImportWallet mnemonic validation', () => {
  let addAndSaveWallet: jest.Mock;
  let navigateToWalletsList: jest.Mock;

  beforeEach(() => {
    addAndSaveWallet = jest.fn().mockResolvedValue(undefined);
    navigateToWalletsList = jest.fn();

    mockUseStorage.mockReturnValue({ wallets: [], addAndSaveWallet });
    mockUseSettings.mockReturnValue({ isScreenCaptureAllowed: true, isClipboardGetContentEnabled: false });
    mockUseExtendedNavigation.mockReturnValue({
      navigateToWalletsList,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      getState: () => ({ index: 0 }),
      setParams: jest.fn(),
      navigate: jest.fn(),
    });
    mockUseScreenProtect.mockReturnValue({ enableScreenProtect: jest.fn(), disableScreenProtect: jest.fn() });
    mockGetDefaultIndexer.mockReturnValue({ getLatestBlockHeight: jest.fn().mockResolvedValue({ height: 800000 }) });
    mockPresentAlert.mockReset();
  });

  it('rejects a non-mnemonic string instead of silently importing it', async () => {
    const { getByTestId } = renderScreen();

    fireEvent.changeText(getByTestId('MnemonicInput'), 'this is not a real seed phrase');
    fireEvent.press(getByTestId('DoImport'));

    await waitFor(() => assert.ok(mockPresentAlert.mock.calls.some(([arg]) => arg.message === loc.wallet_birth.error_invalid_mnemonic)));

    assert.strictEqual(addAndSaveWallet.mock.calls.length, 0);
    assert.strictEqual(navigateToWalletsList.mock.calls.length, 0);
  });

  it('accepts a valid mnemonic and proceeds to save the wallet', async () => {
    const { getByTestId } = renderScreen();

    const validMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    fireEvent.changeText(getByTestId('MnemonicInput'), validMnemonic);
    fireEvent.press(getByTestId('DoImport'));

    await waitFor(() => assert.strictEqual(addAndSaveWallet.mock.calls.length, 1));
    assert.strictEqual(navigateToWalletsList.mock.calls.length, 1);
    assert.strictEqual(
      mockPresentAlert.mock.calls.some(([arg]) => arg.message === loc.wallet_birth.error_invalid_mnemonic),
      false,
    );
  });
});
