import React, { useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import { ShroudButtonLink, ShroudFormLabel, ShroudText } from '../../ShroudComponents';
import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import { Spacing20, Spacing40 } from '../../components/Spacing';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

type NavigationProps = NativeStackNavigationProp<AddWalletStackParamList, 'AddWallet'>;

const WalletsAdd: React.FC = () => {
  const { colors } = useTheme();
  const { addWallet, saveToDisk } = useStorage();
  const { navigate } = useExtendedNavigation<NavigationProps>();

  const [isLoading, setIsLoading] = useState(false);
  const [label, setLabel] = useState('');
  const stylesHook = {
    label: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
    root: {
      backgroundColor: colors.elevated,
    },
    helperText: {
      color: colors.feeText,
    },
  };

  const createWallet = async () => {
    setIsLoading(true);

    try {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setLabel(label || loc.wallets.details_title);
      await wallet.generate();

      addWallet(wallet);
      await saveToDisk();
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);

      navigate('PleaseBackup', {
        walletID: wallet.getID(),
      });
    } catch (error: any) {
      presentAlert({ message: error?.message || String(error) });
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaScrollView
      style={stylesHook.root}
      testID="ScrollView"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets
      automaticallyAdjustsScrollIndicatorInsets
    >
      <Spacing20 />
      <ShroudFormLabel>{loc.wallets.add_wallet_name}</ShroudFormLabel>
      <View style={[styles.label, stylesHook.label]}>
        <TextInput
          testID="WalletNameInput"
          value={label}
          placeholderTextColor="#81868e"
          placeholder={loc.wallets.add_placeholder}
          onChangeText={setLabel}
          style={styles.textInputCommon}
          editable={!isLoading}
          underlineColorAndroid="transparent"
        />
      </View>
      <ShroudFormLabel>{loc.wallets.add_wallet_type}</ShroudFormLabel>
      <View style={styles.typeCard}>
        <ShroudText>{HDSilentPaymentsWallet.typeReadable}</ShroudText>
        <ShroudText style={stylesHook.helperText}>{loc.wallets.add_create}</ShroudText>
      </View>
      <View style={styles.advanced}>
        <Spacing20 />
        {!isLoading ? (
          <>
            <Button testID="Create" title={loc.wallets.add_create} onPress={createWallet} />
            <ShroudButtonLink
              testID="ImportWallet"
              style={styles.import}
              title={loc.wallets.add_import_wallet}
              onPress={() => navigate('ImportWallet')}
            />
            <Spacing40 />
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    </SafeAreaScrollView>
  );
};

const styles = {
  label: {
    flexDirection: 'row' as const,
    borderWidth: 1,
    borderBottomWidth: 0.5,
    minHeight: 44,
    height: 44,
    marginHorizontal: 20,
    alignItems: 'center' as const,
    marginVertical: 16,
    borderRadius: 4,
  },
  textInputCommon: {
    flex: 1,
    marginHorizontal: 8,
    color: '#81868e',
  },
  typeCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    gap: 4,
  },
  advanced: {
    marginHorizontal: 20,
  },
  import: {
    marginVertical: 24,
  },
};

export default WalletsAdd;
