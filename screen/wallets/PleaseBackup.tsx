import { RouteProp, useFocusEffect, useLocale, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View, InteractionManager } from 'react-native';
import { useSettings } from '../../hooks/context/useSettings';
import { useStorage } from '../../hooks/context/useStorage';
import { useScreenProtect } from '../../hooks/useScreenProtect';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation.ts';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { SafeAreaView } from 'react-native-safe-area-context';
import SeedWords from '../../components/SeedWords.tsx';
import loc from '../../loc';
import SeedVerification from '../../components/SeedVerification';

type RouteProps = RouteProp<AddWalletStackParamList, 'PleaseBackup'>;

const PleaseBackup: React.FC = () => {
  const { saveToDisk, addWallet } = useStorage();
  const { seedPhrase } = useRoute<RouteProps>().params;
  const navigation = useExtendedNavigation();
  const { isPrivacyBlurEnabled } = useSettings();
  const { enableScreenProtect, disableScreenProtect } = useScreenProtect();
  const [currentStep, setCurrentStep] = useState<'show-seed' | 'verify'>('show-seed');

  const handleverifycomplete = useCallback(() => {
    // Reset stack and go directly to WalletsList
    InteractionManager.runAfterInteractions(() => {
      navigation.navigateToWalletsList();
    });

    return true;
  }, [navigation]);

  const handleProceedToVerification = () => {
    setCurrentStep('verify');
  };

  const handleBackToSeed = () => {
    setCurrentStep('show-seed');
  };

  const handleVerificationSuccess = async () => {
    try {
      // Create a new HDSilentPaymentsWallet
      const wallet = new HDSilentPaymentsWallet();

      wallet.setLabel(loc.wallets.details_title);
      wallet.setSecret(seedPhrase);

      addWallet(wallet);
      await saveToDisk();
      wallet.setUserHasSavedExport(true);

      // Navigate to wallet list after successful verification
      handleverifycomplete();
    } catch (error) {
      console.error(error);
      // Show error or fallback to seed screen in case of error
      setCurrentStep('show-seed');
    }
  };

  // Handle Android hardware back button to prevent unintended navigation
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      subscription.remove();
    };
  }, []);

  // Enable screen protection if privacy blur is enabled
  useFocusEffect(
    useCallback(() => {
      if (isPrivacyBlurEnabled) enableScreenProtect();
      return () => {
        disableScreenProtect();
      };
    }, [disableScreenProtect, enableScreenProtect, isPrivacyBlurEnabled]),
  );
  // Render different steps based on currentStep state
  // if 'show-seed', display the seed phrase with instructions
  // if 'verify', render SeedVerification component
  return (
    <>
      <SafeAreaView style={{ flex: 1 }}>
        {currentStep === 'show-seed' && (
          <ScrollView
            style={styles.root}
            contentContainerStyle={[styles.flex]}
            testID="PleaseBackupScrollView"
            automaticallyAdjustContentInsets
            contentInsetAdjustmentBehavior="automatic"
          >
            <View style={styles.headerContainer}>
              <Text style={styles.title}>{loc.pleasebackup.title}</Text>
              <Text style={styles.subtitle}>{loc.pleasebackup.text}</Text>
            </View>
            <View style={styles.seedGrid}>
              {seedPhrase.split(' ').map((word: string, idx: number) => (
                <SeedWords key={idx} word={word} index={idx} />
              ))}
            </View>
            <View style={styles.bottom}>
              <TouchableOpacity style={styles.button} onPress={handleProceedToVerification}>
                <Text style={styles.buttonText}>{loc.pleasebackup.noted}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {currentStep === 'verify' && (
          <SeedVerification
            seed={seedPhrase}
            onSuccess={handleVerificationSuccess}
            onBack={handleBackToSeed}
          />
        )}
      </SafeAreaView>
    </>
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
    paddingHorizontal: 16,
    marginTop: 20,
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