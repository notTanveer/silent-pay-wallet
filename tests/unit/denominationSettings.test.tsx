import assert from 'assert';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import DenominationSettings from '../../screen/settings/DenominationSettings';
import { useStorage } from '../../hooks/context/useStorage';
import { BitcoinUnit } from '../../models/bitcoinUnits';

jest.mock('../../hooks/context/useStorage');
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockUseStorage = useStorage as jest.Mock;

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <SafeAreaProvider>
    <NavigationContainer>{children}</NavigationContainer>
  </SafeAreaProvider>
);

const renderScreen = () => render(<DenominationSettings />, { wrapper: Wrapper });

describe('unit - DenominationSettings', () => {
  let wallet: { preferredBalanceUnit: BitcoinUnit; getPreferredBalanceUnit: () => BitcoinUnit };
  let saveToDisk: jest.Mock;

  beforeEach(() => {
    wallet = { preferredBalanceUnit: BitcoinUnit.BTC, getPreferredBalanceUnit: () => wallet.preferredBalanceUnit };
    saveToDisk = jest.fn().mockResolvedValue(undefined);
    mockUseStorage.mockReturnValue({ wallets: [wallet], saveToDisk });
  });

  it('moves the checkmark immediately, before saveToDisk resolves', async () => {
    let resolveSave: () => void = () => {};
    saveToDisk.mockReturnValue(new Promise<void>(resolve => (resolveSave = resolve)));

    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('DenominationSatsOption'));

    await waitFor(() => assert.strictEqual(wallet.preferredBalanceUnit, BitcoinUnit.SATS));
    assert.strictEqual(saveToDisk.mock.calls.length, 1);

    resolveSave();
  });

  it('logs and does not throw when saveToDisk rejects', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    saveToDisk.mockRejectedValue(new Error('disk write failed'));

    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('DenominationSatsOption'));

    await waitFor(() => assert.strictEqual(consoleError.mock.calls.length, 1));
    assert.strictEqual(wallet.preferredBalanceUnit, BitcoinUnit.SATS);

    consoleError.mockRestore();
  });

  it('does nothing when pressing the already-selected unit', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('DenominationBtcOption'));

    assert.strictEqual(saveToDisk.mock.calls.length, 0);
  });
});
