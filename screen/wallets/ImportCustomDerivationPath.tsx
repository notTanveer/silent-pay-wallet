import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import debounce from '../../blue_modules/debounce';
import { BlueFormLabel, BlueTextCentered } from '../../BlueComponents';
import { validateBip32 } from '../../class/wallet-import';
import type { TWallet } from '../../class/wallets/types';
import Button from '../../components/Button';
import SafeArea from '../../components/SafeArea';
import { useTheme } from '../../components/themes';
import WalletToImport from '../../components/WalletToImport';
import { useStorage } from '../../hooks/context/useStorage';
import loc from '../../loc';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { useSettings } from '../../hooks/context/useSettings';
import { BlueSpacing20 } from '../../components/BlueSpacing';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';

type RouteProps = RouteProp<AddWalletStackParamList, 'ImportCustomDerivationPath'>;
type NavigationProp = NativeStackNavigationProp<AddWalletStackParamList, 'ImportCustomDerivationPath'>;

const ListEmptyComponent: React.FC = () => <BlueTextCentered>{loc.wallets.import_wrong_path}</BlueTextCentered>;

const WRONG_PATH = 'WRONG_PATH';
enum Status {
  WalletFound = 'WALLET_FOUND',
  WalletNotFound = 'WALLET_NOTFOUND',
  WalletUnknown = 'WALLET_UNKNOWN',
}

type WalletByPath = Record<string, TWallet | typeof WRONG_PATH>;
type UsedByPath = Record<string, Status>;
type Item = [type: string, typeReadable: string, Status | undefined];

const ImportCustomDerivationPath: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { importText, password } = useRoute<RouteProps>().params;
  const { addAndSaveWallet } = useStorage();
  const { isElectrumDisabled } = useSettings();

  const [path, setPath] = useState<string>(HDSilentPaymentsWallet.derivationPath);
  const [wallets, setWallets] = useState<WalletByPath>({});
  const [used, setUsed] = useState<UsedByPath>({});
  const importing = useRef(false);

  const debouncedSavePath = useRef(
    debounce(async (newPath: string) => {
      if (!validateBip32(newPath)) {
        setWallets(currentWallets => ({ ...currentWallets, [newPath]: WRONG_PATH }));
        return;
      }

      const wallet = new HDSilentPaymentsWallet();
      wallet.setSecret(importText);
      if (password) {
        wallet.setPassphrase(password);
      }
      wallet.setDerivationPath(newPath);
      setWallets(currentWallets => ({ ...currentWallets, [newPath]: wallet }));

      if (isElectrumDisabled) {
        setUsed(currentUsed => ({ ...currentUsed, [newPath]: Status.WalletUnknown }));
        return;
      }

      try {
        const wasUsed = await wallet.wasEverUsed();
        setUsed(currentUsed => ({ ...currentUsed, [newPath]: wasUsed ? Status.WalletFound : Status.WalletNotFound }));
      } catch (_error) {
        setUsed(currentUsed => ({ ...currentUsed, [newPath]: Status.WalletUnknown }));
      }
    }, 500),
  );

  useEffect(() => {
    if (path in wallets) return;
    debouncedSavePath.current(path);
  }, [path, wallets]);

  const items: Item[] = useMemo(() => {
    if (wallets[path] === WRONG_PATH) return [];
    return [[HDSilentPaymentsWallet.type, HDSilentPaymentsWallet.typeReadable, used[path]]];
  }, [path, used, wallets]);

  const stylesHook = StyleSheet.create({
    root: {
      backgroundColor: colors.elevated,
    },
    center: {
      backgroundColor: colors.elevated,
    },
    pathInput: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
  });

  const saveWallet = () => {
    if (importing.current || wallets[path] === WRONG_PATH) return;
    const candidateWallet = wallets[path];
    if (candidateWallet == null) return;
    importing.current = true;
    addAndSaveWallet(candidateWallet);
    navigation.getParent()?.goBack();
  };

  const renderItem = ({ item }: { item: Item }) => {
    const [type, title, found] = item;
    let subtitle;
    switch (found) {
      case Status.WalletFound:
        subtitle = loc.wallets.import_derivation_found;
        break;
      case Status.WalletNotFound:
        subtitle = loc.wallets.import_derivation_found_not;
        break;
      case Status.WalletUnknown:
        subtitle = loc.wallets.import_derivation_unknown;
        break;
      default:
        subtitle = loc.wallets.import_derivation_loading;
    }

    return <WalletToImport key={type} title={title} subtitle={subtitle} active onPress={() => undefined} />;
  };

  const disabled = wallets[path] === WRONG_PATH || !(path in wallets) || wallets[path] === undefined;

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <BlueSpacing20 />
      <BlueFormLabel>{loc.wallets.import_derivation_subtitle}</BlueFormLabel>
      <BlueSpacing20 />
      <TextInput
        testID="DerivationPathInput"
        placeholder={loc.send.details_note_placeholder}
        value={path}
        placeholderTextColor="#81868e"
        style={[styles.pathInput, stylesHook.pathInput]}
        onChangeText={setPath}
      />
      <FlatList
        data={items}
        keyExtractor={item => path + item[0]}
        renderItem={renderItem}
        contentContainerStyle={styles.flatListContainer}
        ListEmptyComponent={ListEmptyComponent}
      />

      <View style={[styles.center, stylesHook.center]}>
        <View style={styles.buttonContainer}>
          <Button disabled={disabled} title={loc.wallets.import_do_import} testID="ImportButton" onPress={saveWallet} />
        </View>
      </View>
    </SafeArea>
  );
};

const styles = StyleSheet.create({
  root: {
    paddingTop: 10,
  },
  flatListContainer: {
    marginHorizontal: 16,
  },
  center: {
    marginHorizontal: 16,
    alignItems: 'center',
    top: -100,
  },
  buttonContainer: {
    height: 45,
  },
  pathInput: {
    flexDirection: 'row',
    borderWidth: 1,
    borderBottomWidth: 0.5,
    marginHorizontal: 16,
    minHeight: 44,
    height: 44,
    alignItems: 'center',
    marginVertical: 8,
    borderRadius: 4,
    paddingHorizontal: 8,
    color: '#81868e',
  },
});

export default ImportCustomDerivationPath;
