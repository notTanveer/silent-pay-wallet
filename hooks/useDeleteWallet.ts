import { useCallback } from 'react';
import { CommonActions } from '@react-navigation/native';
import { useStorage } from './context/useStorage';
import { useBiometrics, unlockWithBiometrics } from './useBiometrics';
import { useExtendedNavigation } from './useExtendedNavigation';
import loc from '../loc';
import presentAlert from '../components/Alert';

export const useDeleteWallet = () => {
  const { wallets, handleWalletDeletion } = useStorage();
  const { isBiometricUseCapableAndEnabled } = useBiometrics();
  const navigation = useExtendedNavigation();

  return useCallback(() => {
    const wallet = wallets[0];
    if (!wallet) return;

    presentAlert({
      title: loc.wallets.details_delete_wallet,
      message: loc.wallets.details_are_you_sure,
      buttons: [
        { text: loc._.cancel, style: 'cancel' },
        {
          text: loc.wallets.details_yes_delete,
          style: 'destructive',
          onPress: async () => {
            const biometricsEnabled = await isBiometricUseCapableAndEnabled();
            if (biometricsEnabled && !(await unlockWithBiometrics())) return;
            const ok = await handleWalletDeletion(wallet.getID());
            if (ok) {
              navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Onboarding' }] }));
            }
          },
        },
      ],
      options: { cancelable: false },
    });
  }, [wallets, handleWalletDeletion, isBiometricUseCapableAndEnabled, navigation]);
};
