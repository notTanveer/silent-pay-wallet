import { RouteProp, useFocusEffect, useLocale, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View, InteractionManager } from 'react-native';
import { useTheme } from '../../components/themes';
import { useSettings } from '../../hooks/context/useSettings';
import { useStorage } from '../../hooks/context/useStorage';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { useScreenProtect } from '../../hooks/useScreenProtect';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation.ts';

type RouteProps = RouteProp<AddWalletStackParamList, 'PleaseBackup'>;

const PleaseBackup: React.FC = () => {
  const { wallets, saveToDisk } = useStorage();
  const { walletID } = useRoute<RouteProps>().params;
  const wallet = wallets.find(w => w.getID() === walletID)!;
  const navigation = useExtendedNavigation();
  const { isPrivacyBlurEnabled } = useSettings();
  const { colors } = useTheme();
  const { direction } = useLocale();
  const { enableScreenProtect, disableScreenProtect } = useScreenProtect();

  const stylesHook = StyleSheet.create({
    flex: {
      backgroundColor: colors.elevated,
    },
    pleaseText: {
      color: colors.foregroundColor,
      writingDirection: direction,
    },
  });

  const handleContinue = useCallback(() => {
    // Mark that the user has saved the backup
    wallet.setUserHasSavedExport(true);
    saveToDisk();

    // Reset stack and go directly to WalletsList
    InteractionManager.runAfterInteractions(() => {
      navigation.navigateToWalletsList();
    });

    return true;
  }, [navigation, wallet, saveToDisk]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isPrivacyBlurEnabled) enableScreenProtect();
      return () => {
        disableScreenProtect();
      };
    }, [disableScreenProtect, enableScreenProtect, isPrivacyBlurEnabled]),
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.flex, stylesHook.flex]}
      testID="PleaseBackupScrollView"
      automaticallyAdjustContentInsets
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.headerContainer}>
        <Text style={styles.title}>This is your recovery phrase</Text>
        <Text style={styles.subtitle}>Make sure to write it down as shown here.</Text>
        <Text style={styles.subtitle}>You would need this to recover your account.</Text>
      </View>
      <View style={styles.seedGrid}>
        {wallet.getSecret()?.split(' ').map((word, idx) => (
          <View key={idx} style={styles.seedItem}>
            <Text style={styles.seedIndex}>{idx + 1}</Text>
            <Text style={styles.seedWord}>{word}</Text>
          </View>
        ))}
      </View>
      <View style={styles.bottom}>
        <TouchableOpacity style={styles.button} onPress={handleContinue} testID="PleasebackupOk">
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
    justifyContent: 'space-around',
  },
  headerContainer: {
    marginTop: 32,
    marginBottom: 16,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  title: {
    paddingTop: 80
    ,
    fontSize: 25,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#222',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  seedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  seedItem: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#222',
    width: '42%',
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    margin: 6,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  seedIndex: {
    fontWeight: 'bold',
    fontSize: 15,
    marginRight: 8,
    color: '#000000ff',
  },
  seedWord: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
  },
  bottom: {
    marginBottom: 32,
    flexGrow: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#FFA726',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
  },
});

export default PleaseBackup;
