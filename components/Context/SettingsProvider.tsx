import * as Electrum from '../../modules/Electrum';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import DefaultPreference from 'react-native-default-preference';
import { isReadClipboardAllowed, setReadClipboardAllowed } from '../../modules/clipboard';
import { getPreferredCurrency, GROUP_IO_SHROUD, initCurrencyDaemon, setPreferredCurrency } from '../../modules/currency';
import { ShroudApp } from '../../class';

import { FiatUnit, TFiatUnit } from '../../models/fiatUnit';
import { useStorage } from '../../hooks/context/useStorage';
import { BitcoinUnit } from '../../models/bitcoinUnits';

const TotalWalletsBalanceKey = 'TotalWalletsBalance';
const TotalWalletsBalancePreferredUnit = 'TotalWalletsBalancePreferredUnit';
const ThemePreferenceKey = 'ThemePreference';
const WalletShortcutsEnabledKey = 'WalletShortcutsEnabled';

export type ThemePreference = 'system' | 'light' | 'dark';

const readPref = async <T,>(key: string, parse: (value: string | number | boolean | null) => T, fallback: T): Promise<T> => {
  try {
    await DefaultPreference.setName(GROUP_IO_SHROUD);
    return parse(await DefaultPreference.get(key));
  } catch (e) {
    console.error(`Error getting ${key}:`, e);
    return fallback;
  }
};

const writePref = async (key: string, value: string): Promise<void> => {
  try {
    await DefaultPreference.setName(GROUP_IO_SHROUD);
    await DefaultPreference.set(key, value);
  } catch (e) {
    console.error(`Error setting ${key}:`, e);
  }
};

const getThemePreferenceStorage = (): Promise<ThemePreference> =>
  readPref(ThemePreferenceKey, value => (value === 'light' || value === 'dark' || value === 'system' ? value : 'system'), 'system');

const persistThemePreference = (value: ThemePreference): Promise<void> => writePref(ThemePreferenceKey, value);

const getIsWalletShortcutsEnabledStorage = (): Promise<boolean> =>
  readPref(WalletShortcutsEnabledKey, value => (value === null ? true : value === 'true'), true);

const persistIsWalletShortcutsEnabled = (value: boolean): Promise<void> => writePref(WalletShortcutsEnabledKey, value ? 'true' : 'false');

const getDoNotTrackStorage = (): Promise<boolean> => readPref(ShroudApp.DO_NOT_TRACK, value => value === '1', false);

const getIsTotalBalanceViewEnabled = (): Promise<boolean> => readPref(TotalWalletsBalanceKey, value => (value ?? 'true') === 'true', true);

const getTotalBalancePreferredUnit = (): Promise<BitcoinUnit> =>
  readPref(TotalWalletsBalancePreferredUnit, value => (value as BitcoinUnit | null) ?? BitcoinUnit.BTC, BitcoinUnit.BTC);

const persistTotalBalancePreferredUnit = (unit: BitcoinUnit): Promise<void> => writePref(TotalWalletsBalancePreferredUnit, unit);

interface SettingsContextType {
  preferredFiatCurrency: TFiatUnit;
  setPreferredFiatCurrencyStorage: (currency: TFiatUnit) => Promise<void>;
  isScreenCaptureAllowed: boolean;
  setIsScreenCaptureAllowed: (value: boolean) => void;
  isDoNotTrackEnabled: boolean;
  isClipboardGetContentEnabled: boolean;
  setIsClipboardGetContentEnabledStorage: (value: boolean) => Promise<void>;
  isTotalBalanceEnabled: boolean;
  totalBalancePreferredUnit: BitcoinUnit;
  setTotalBalancePreferredUnitStorage: (unit: BitcoinUnit) => Promise<void>;
  isElectrumDisabled: boolean;
  setIsElectrumDisabled: (value: boolean) => void;
  themePreference: ThemePreference;
  setThemePreferenceStorage: (value: ThemePreference) => Promise<void>;
  isWalletShortcutsEnabled: boolean;
  setIsWalletShortcutsEnabledStorage: (value: boolean) => Promise<void>;
  settingsLoaded: boolean;
}

const defaultSettingsContext: SettingsContextType = {
  preferredFiatCurrency: FiatUnit.USD,
  setPreferredFiatCurrencyStorage: async () => {},
  isScreenCaptureAllowed: false,
  setIsScreenCaptureAllowed: () => {},
  isDoNotTrackEnabled: false,
  isClipboardGetContentEnabled: true,
  setIsClipboardGetContentEnabledStorage: async () => {},
  isTotalBalanceEnabled: true,
  totalBalancePreferredUnit: BitcoinUnit.BTC,
  setTotalBalancePreferredUnitStorage: async () => {},
  isElectrumDisabled: false,
  setIsElectrumDisabled: () => {},
  themePreference: 'system',
  setThemePreferenceStorage: async () => {},
  isWalletShortcutsEnabled: true,
  setIsWalletShortcutsEnabledStorage: async () => {},
  settingsLoaded: false,
};

export const SettingsContext = createContext<SettingsContextType>(defaultSettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = React.memo(({ children }: { children: React.ReactNode }) => {
  const [preferredFiatCurrency, setPreferredFiatCurrencyState] = useState<TFiatUnit>(FiatUnit.USD);
  // Intentionally not persisted: screen-capture protection always resets to enabled (capture disallowed) on relaunch.
  const [isScreenCaptureAllowed, setIsScreenCaptureAllowed] = useState<boolean>(false);
  const [isDoNotTrackEnabled, setIsDoNotTrackEnabled] = useState<boolean>(false);
  const [isClipboardGetContentEnabled, setIsClipboardGetContentEnabled] = useState<boolean>(true);
  const [isTotalBalanceEnabled, setIsTotalBalanceEnabled] = useState<boolean>(true);
  const [totalBalancePreferredUnit, setTotalBalancePreferredUnit] = useState<BitcoinUnit>(BitcoinUnit.BTC);
  const [isElectrumDisabled, setIsElectrumDisabled] = useState<boolean>(true);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [isWalletShortcutsEnabled, setIsWalletShortcutsEnabled] = useState<boolean>(true);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  const { walletsInitialized } = useStorage();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await DefaultPreference.setName(GROUP_IO_SHROUD);
      } catch (e) {
        console.error('Error setting preference name:', e);
      }

      const promises: Promise<void>[] = [
        Electrum.isDisabled().then(disabled => {
          setIsElectrumDisabled(disabled);
        }),
        isReadClipboardAllowed().then(clipboardEnabled => {
          setIsClipboardGetContentEnabled(clipboardEnabled);
        }),
        getDoNotTrackStorage().then(doNotTrack => {
          setIsDoNotTrackEnabled(doNotTrack);
        }),
        getIsTotalBalanceViewEnabled().then(totalBalanceEnabled => {
          setIsTotalBalanceEnabled(totalBalanceEnabled);
        }),
        getTotalBalancePreferredUnit().then(preferredUnit => {
          setTotalBalancePreferredUnit(preferredUnit);
        }),
        getThemePreferenceStorage().then(preference => {
          setThemePreference(preference);
        }),
        getIsWalletShortcutsEnabledStorage().then(enabled => {
          setIsWalletShortcutsEnabled(enabled);
        }),
      ];

      const results = await Promise.allSettled(promises);

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Error loading setting ${index}:`, result.reason);
        }
      });

      setSettingsLoaded(true);
    };

    loadSettings();
  }, []);

  useEffect(() => {
    initCurrencyDaemon()
      .then(getPreferredCurrency)
      .then(currency => {
        console.debug('SettingsContext currency:', currency);
        setPreferredFiatCurrencyState(currency as TFiatUnit);
      })
      .catch(e => {
        console.error('Error initializing currency daemon or getting preferred currency:', e);
      });
  }, []);

  useEffect(() => {
    if (walletsInitialized) {
      isElectrumDisabled ? Electrum.forceDisconnect() : Electrum.connectMain();
    }
  }, [isElectrumDisabled, walletsInitialized]);

  const setPreferredFiatCurrencyStorage = useCallback(async (currency: TFiatUnit): Promise<void> => {
    try {
      await setPreferredCurrency(currency);
      setPreferredFiatCurrencyState(currency);
    } catch (e) {
      console.error('Error setting preferredFiatCurrency:', e);
    }
  }, []);

  const setTotalBalancePreferredUnitStorage = useCallback(async (unit: BitcoinUnit): Promise<void> => {
    try {
      await persistTotalBalancePreferredUnit(unit);
      setTotalBalancePreferredUnit(unit);
    } catch (e) {
      console.error('Error setting totalBalancePreferredUnit:', e);
    }
  }, []);

  const setIsClipboardGetContentEnabledStorage = useCallback(async (value: boolean): Promise<void> => {
    try {
      await setReadClipboardAllowed(value);
      setIsClipboardGetContentEnabled(value);
    } catch (e) {
      console.error('Error setting isClipboardGetContentEnabled:', e);
    }
  }, []);

  const setThemePreferenceStorage = useCallback(async (value: ThemePreference): Promise<void> => {
    try {
      await persistThemePreference(value);
      setThemePreference(value);
    } catch (e) {
      console.error('Error setting themePreference:', e);
    }
  }, []);

  const setIsWalletShortcutsEnabledStorage = useCallback(async (value: boolean): Promise<void> => {
    try {
      await persistIsWalletShortcutsEnabled(value);
      setIsWalletShortcutsEnabled(value);
    } catch (e) {
      console.error('Error setting isWalletShortcutsEnabled:', e);
    }
  }, []);

  const value = useMemo(
    () => ({
      preferredFiatCurrency,
      setPreferredFiatCurrencyStorage,
      isScreenCaptureAllowed,
      setIsScreenCaptureAllowed,
      isDoNotTrackEnabled,
      isClipboardGetContentEnabled,
      setIsClipboardGetContentEnabledStorage,
      isTotalBalanceEnabled,
      totalBalancePreferredUnit,
      setTotalBalancePreferredUnitStorage,
      isElectrumDisabled,
      setIsElectrumDisabled,
      themePreference,
      setThemePreferenceStorage,
      isWalletShortcutsEnabled,
      setIsWalletShortcutsEnabledStorage,
      settingsLoaded,
    }),
    [
      preferredFiatCurrency,
      setPreferredFiatCurrencyStorage,
      isScreenCaptureAllowed,
      isDoNotTrackEnabled,
      isClipboardGetContentEnabled,
      setIsClipboardGetContentEnabledStorage,
      isTotalBalanceEnabled,
      totalBalancePreferredUnit,
      setTotalBalancePreferredUnitStorage,
      isElectrumDisabled,
      themePreference,
      setThemePreferenceStorage,
      isWalletShortcutsEnabled,
      setIsWalletShortcutsEnabledStorage,
      settingsLoaded,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
});
