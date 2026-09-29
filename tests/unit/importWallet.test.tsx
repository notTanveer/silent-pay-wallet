import assert from 'assert';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Clipboard from '@react-native-clipboard/clipboard';

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
// Hand-rolled and load-bearing: the official safe-area mock lacks initialMetrics (breaks SafeAreaScrollView's useSafeAreaInsets), and themes.ts's useTheme needs a real NavigationContainer — swapping either for a library default breaks rendering.
jest.mock('../../components/DoneAndDismissKeyboardInputAccessory', () => ({
  DoneAndDismissKeyboardInputAccessory: () => null,
  DoneAndDismissKeyboardInputAccessoryViewID: 'DoneAndDismissKeyboardInputAccessory',
}));
jest.mock('../../modules/SilentPaymentIndexer');
jest.mock('../../components/Alert');
jest.mock('../../modules/hapticFeedback');
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

const VALID_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const renderScreen = () =>
  render(
    <SafeAreaProvider>
      <NavigationContainer>
        <ImportWallet />
      </NavigationContainer>
    </SafeAreaProvider>,
  );

describe('unit - ImportWallet', () => {
  let addAndSaveWallet: jest.Mock;
  let navigateToWalletsList: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

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
  });

  const invalidMnemonicAlerts = () =>
    mockPresentAlert.mock.calls.filter(([arg]) => arg.message === loc.wallet_birth.error_invalid_mnemonic).length;

  describe('mnemonic validation', () => {
    it('rejects a non-mnemonic string instead of silently importing it', async () => {
      const { getByTestId } = renderScreen();

      fireEvent.changeText(getByTestId('MnemonicInput'), 'this is not a real seed phrase');
      fireEvent.press(getByTestId('DoImport'));

      await waitFor(() => assert.strictEqual(invalidMnemonicAlerts(), 1, 'expected an invalid-mnemonic alert'));

      assert.strictEqual(addAndSaveWallet.mock.calls.length, 0);
      assert.strictEqual(navigateToWalletsList.mock.calls.length, 0);
    });

    it('accepts a valid mnemonic, saves the wallet, and hands off after the success sheet is dismissed', async () => {
      const { getByTestId } = renderScreen();

      fireEvent.changeText(getByTestId('MnemonicInput'), VALID_MNEMONIC);
      fireEvent.press(getByTestId('DoImport'));

      await waitFor(() => assert.strictEqual(addAndSaveWallet.mock.calls.length, 1));
      assert.strictEqual(invalidMnemonicAlerts(), 0);

      const [savedWallet] = addAndSaveWallet.mock.calls[0];
      assert.strictEqual(savedWallet.getSecret(), VALID_MNEMONIC);
      assert.strictEqual(savedWallet.getDerivationPath(), "m/86'/0'/0'");

      // Landing on the wallets list waits for the "You're all set" sheet's Done button.
      assert.strictEqual(navigateToWalletsList.mock.calls.length, 0);
      await waitFor(() => getByTestId('RestoreSuccessDoneButton'));
      fireEvent.press(getByTestId('RestoreSuccessDoneButton'));
      await waitFor(() => assert.strictEqual(navigateToWalletsList.mock.calls.length, 1));
    });

    it('shows the save error and no success sheet when the wallet cannot be added', async () => {
      addAndSaveWallet.mockRejectedValue(new Error(loc.wallets.single_wallet_limit));
      const { getByTestId, queryByTestId } = renderScreen();

      fireEvent.changeText(getByTestId('MnemonicInput'), VALID_MNEMONIC);
      fireEvent.press(getByTestId('DoImport'));

      await waitFor(() =>
        assert.ok(
          mockPresentAlert.mock.calls.some(([arg]) => arg.message === loc.wallets.single_wallet_limit),
          'expected the limit alert',
        ),
      );
      assert.strictEqual(queryByTestId('RestoreSuccessSheet'), null);
    });
  });

  describe('paste button', () => {
    const mockClipboard = Clipboard as jest.Mocked<typeof Clipboard>;

    beforeEach(() => {
      mockUseSettings.mockReturnValue({ isScreenCaptureAllowed: true, isClipboardGetContentEnabled: true });
    });

    it('is hidden when clipboard reading is disabled', () => {
      mockUseSettings.mockReturnValue({ isScreenCaptureAllowed: true, isClipboardGetContentEnabled: false });
      const { queryByTestId } = renderScreen();
      assert.strictEqual(queryByTestId('PasteFromClipboardButton'), null);
    });

    it('fills the input from the clipboard', async () => {
      mockClipboard.getImage = jest.fn().mockResolvedValue('');
      mockClipboard.getString.mockResolvedValue(VALID_MNEMONIC);
      const { getByTestId } = renderScreen();

      fireEvent.press(getByTestId('PasteFromClipboardButton'));

      await waitFor(() => assert.strictEqual(getByTestId('MnemonicInput').props.value, VALID_MNEMONIC));
    });
  });
});
