import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { BlueFormLabel, BlueFormMultiInput } from '../../BlueComponents';
import presentAlert from '../../components/Alert';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { BlueSpacing20 } from '../../components/BlueSpacing';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

type NavigationProp = NativeStackNavigationProp<AddWalletStackParamList, 'ImportSpeed'>;

const ImportSpeed = () => {
  const navigation = useExtendedNavigation<NavigationProp>();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [importText, setImportText] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const { addAndSaveWallet } = useStorage();

  const styles = StyleSheet.create({
    root: {
      paddingTop: 40,
      backgroundColor: colors.elevated,
    },
    center: {
      flex: 1,
      marginHorizontal: 16,
      backgroundColor: colors.elevated,
    },
    pathInput: {
      flexDirection: 'row',
      borderWidth: 1,
      borderBottomWidth: 0.5,
      minHeight: 44,
      height: 44,
      alignItems: 'center',
      marginVertical: 8,
      borderRadius: 4,
      paddingHorizontal: 8,
      color: '#81868e',
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
  });

  const importMnemonic = async () => {
    setLoading(true);
    try {
      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(importText);

      if (!wallet.validateMnemonic()) {
        throw new Error('Only BIP39 mnemonics for HD Silent Payments wallets are supported.');
      }

      if (passphrase) {
        wallet.setPassphrase(passphrase);
      }

      addAndSaveWallet(wallet);
      navigation.navigateToWalletsList();
    } catch (error: any) {
      presentAlert({ message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeArea style={styles.root}>
      <BlueSpacing20 />
      <BlueFormLabel>Mnemonic</BlueFormLabel>
      <BlueSpacing20 />
      <BlueFormMultiInput testID="SpeedMnemonicInput" value={importText} onChangeText={setImportText} />
      <BlueFormLabel>Passphrase</BlueFormLabel>
      <TextInput testID="SpeedPassphraseInput" value={passphrase} style={styles.pathInput} onChangeText={setPassphrase} />
      <BlueSpacing20 />
      <View style={styles.center}>
        <Button testID="SpeedDoImport" title="Import" onPress={importMnemonic} />
        {loading && <ActivityIndicator />}
      </View>
    </SafeArea>
  );
};

export default ImportSpeed;
