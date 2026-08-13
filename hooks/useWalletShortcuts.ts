import { useEffect, useRef } from 'react';
import { EventSubscription } from 'react-native';
import { navigate, onNavigationReady } from '../NavigationService';
import { useSettings } from './context/useSettings';
import { useStorage } from './context/useStorage';
import {
  addOnShortcutUsedListener,
  getInitialShortcutId,
  registerWalletBalanceShortcut,
  unregisterWalletBalanceShortcut,
  WALLET_BALANCE_SHORTCUT_ID,
} from '../modules/walletShortcuts';
import loc from '../loc';

export const useWalletShortcuts = () => {
  const { isWalletShortcutsEnabled, settingsLoaded } = useSettings();
  const { wallets } = useStorage();
  const listenerRef = useRef<EventSubscription | null>(null);
  // Read via ref inside the listener so the effect below can stay subscribed for the
  // component's lifetime instead of tearing down and re-registering on every wallet change.
  const walletsRef = useRef(wallets);
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  // Same reasoning as walletsRef: the listener effect stays mounted for life, so it
  // needs a live read of the enabled/loaded state rather than a stale closure value.
  const isEnabledRef = useRef(isWalletShortcutsEnabled && settingsLoaded);
  useEffect(() => {
    isEnabledRef.current = isWalletShortcutsEnabled && settingsLoaded;
  }, [isWalletShortcutsEnabled, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (isWalletShortcutsEnabled) {
      registerWalletBalanceShortcut(loc.settings.general_wallet_shortcuts_action_title);
    } else {
      unregisterWalletBalanceShortcut();
    }
  }, [isWalletShortcutsEnabled, settingsLoaded]);

  useEffect(() => {
    const handleShortcut = (id: string) => {
      if (id === WALLET_BALANCE_SHORTCUT_ID && isEnabledRef.current && walletsRef.current.length > 0) {
        navigate('WalletsList');
      }
    };

    onNavigationReady(() => {
      getInitialShortcutId().then(id => {
        if (id) handleShortcut(id);
      });
    });

    listenerRef.current = addOnShortcutUsedListener(handleShortcut);

    return () => {
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, []);
};
