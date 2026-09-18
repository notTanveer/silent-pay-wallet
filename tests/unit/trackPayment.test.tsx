import assert from 'assert';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TrackPayment from '../../screen/wallets/TrackPayment';
import { useStorage } from '../../hooks/context/useStorage';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';

jest.mock('../../hooks/context/useStorage');
jest.mock('../../hooks/useExtendedNavigation');
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 320, height: 640 }),
}));

const mockUseStorage = useStorage as jest.Mock;
const mockUseExtendedNavigation = useExtendedNavigation as jest.Mock;

const renderScreen = () =>
  render(
    <SafeAreaProvider>
      <NavigationContainer>
        <TrackPayment navigation={{} as never} route={{} as never} />
      </NavigationContainer>
    </SafeAreaProvider>,
  );

describe('unit - TrackPayment', () => {
  let scanByTxid: jest.Mock;
  let navigate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    scanByTxid = jest.fn().mockResolvedValue({ found: false });
    mockUseStorage.mockReturnValue({ wallets: [{ scanByTxid }] });

    navigate = jest.fn();
    mockUseExtendedNavigation.mockReturnValue({ navigate });
  });

  describe('Check Transaction button', () => {
    it.each([
      ['empty input', ''],
      ['a 63-character txid', 'a'.repeat(63)],
      ['a 64-character non-hex string', 'g'.repeat(64)],
    ])('stays disabled for %s', (_label, input) => {
      const { getByTestId } = renderScreen();

      fireEvent.changeText(getByTestId('TrackPaymentTxidInput'), input);
      fireEvent.press(getByTestId('CheckTransactionButton'));

      assert.strictEqual(scanByTxid.mock.calls.length, 0, 'a disabled button must not trigger a scan');
    });

    it('is enabled for a valid 64-character hex txid', async () => {
      const { getByTestId } = renderScreen();
      const validTxid = 'a'.repeat(64);

      fireEvent.changeText(getByTestId('TrackPaymentTxidInput'), validTxid);
      fireEvent.press(getByTestId('CheckTransactionButton'));

      await waitFor(() => assert.strictEqual(scanByTxid.mock.calls.length, 1));
      assert.strictEqual(scanByTxid.mock.calls[0][0], validTxid);
    });
  });
});
