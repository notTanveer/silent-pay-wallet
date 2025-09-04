import React, { useCallback } from 'react';
import { Alert } from 'react-native';
import ListItem from '../../components/ListItem';
import { useStorage } from '../../hooks/context/useStorage';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../blue_modules/hapticFeedback';
import loc from '../../loc';

const DeleteWallet: React.FC = () => {
  const { wallets, handleWalletDeletion } = useStorage();

  const handleDeleteWallet = useCallback(async () => {
    const wallet = wallets.length > 0 ? wallets[0] : null;
    if (!wallet) {
      Alert.alert(loc.wallets.list_empty_txs1, 'No wallet available to delete');
      return;
    }

    Alert.alert(
      loc.wallets.details_delete_wallet,
      loc.wallets.details_are_you_sure,
      [
        {
          text: loc._.cancel,
          style: 'cancel',
        },
        {
          text: loc.wallets.details_yes_delete,
          style: 'destructive',
          onPress: async () => {
            const deletionSucceeded = await handleWalletDeletion(wallet.getID());
            if (deletionSucceeded) {
              triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, [wallets, handleWalletDeletion]);

  if (wallets.length === 0) {
    return null;
  }

  return (
    <ListItem 
      title="Delete Wallet" 
      onPress={handleDeleteWallet} 
      testID="DeleteWalletButton" 
      chevron={false}
    />
  );
};

export default DeleteWallet;
