import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  InteractionManager,
} from 'react-native';
import { useSettings } from '../../hooks/context/useSettings';
import { useStorage } from '../../hooks/context/useStorage';
import { useScreenProtect } from '../../hooks/useScreenProtect';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation.ts';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { SafeAreaView } from 'react-native-safe-area-context';
import SeedWords from '../../components/SeedWords.tsx';
import loc from '../../loc';
import SeedVerification from '../../components/SeedVerification';
import { isE2E } from '../../helpers/e2e';

type RouteProps = RouteProp<AddWalletStackParamList, 'PleaseBackup'>;

enum BackupStep {
  SHOW_SEED = 'show-seed',
  VERIFY = 'verify',
}

const SKIP_VERIFY_TAP_THRESHOLD = 5;

const PleaseBackup: React.FC = () => {
  const { wallets } = useStorage();
  const { walletID } = useRoute<RouteProps>().params;
  const wallet = wallets.find(w => w.getID() === walletID)!;
  const seedPhrase = wallet.getSecret();
  const navigation = useExtendedNavigation();
  const { isScreenCaptureAllowed } = useSettings();
  const { enableScreenProtect, disableScreenProtect } = useScreenProtect();
  const [currentStep, setCurrentStep] = useState<BackupStep>(BackupStep.SHOW_SEED);
  const [skipVerifyTaps, setSkipVerifyTaps] = useState(0);
  const handleVerifyComplete = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      navigation.navigateToWalletsList();
    });
    return true;
  }, [navigation]);

  useEffect(() => {
    if (skipVerifyTaps >= SKIP_VERIFY_TAP_THRESHOLD) handleVerifyComplete();
  }, [skipVerifyTaps, handleVerifyComplete]);

  const handleProceedToVerification = () => {
    setCurrentStep(BackupStep.VERIFY);
  };

  const handleBackToSeed = () => {
    setCurrentStep(BackupStep.SHOW_SEED);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);

    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isScreenCaptureAllowed) enableScreenProtect();
      return () => {
        disableScreenProtect();
      };
    }, [disableScreenProtect, enableScreenProtect, isScreenCaptureAllowed]),
  );

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        {currentStep === BackupStep.SHOW_SEED && (
          <ScrollView style={styles.root} contentContainerStyle={[styles.flex]} testID="PleaseBackupScrollView">
            <View>
              <Text style={styles.title}>{loc.pleasebackup.title}</Text>
              <Text style={styles.subtitle}>{loc.pleasebackup.text}</Text>
              <View style={styles.seedGrid}>
                {seedPhrase.split(' ').map((word: string, idx: number) => (
                  <SeedWords key={idx} word={word} index={idx} />
                ))}
              </View>
            </View>
            <View style={styles.bottom}>
              <TouchableOpacity style={styles.button} onPress={handleProceedToVerification}>
                <Text style={styles.buttonText}>{loc.pleasebackup.noted}</Text>
              </TouchableOpacity>
            </View>
            {isE2E() && (
              <TouchableWithoutFeedback
                onPress={() => setSkipVerifyTaps(c => c + 1)}
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                testID="SkipVerifyBackdoor"
              >
                <View style={styles.skipVerifyBackdoor} />
              </TouchableWithoutFeedback>
            )}
          </ScrollView>
        )}

        {currentStep === 'verify' && (
          <SeedVerification seed={seedPhrase.split(' ')} onSuccess={handleVerifyComplete} onBack={handleBackToSeed} />
        )}
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  root: {
    padding: 10,
  },
  flex: {
    flex: 1,
    justifyContent: 'space-between',
  },
  title: {
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
    paddingBottom: 10,
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
    justifyContent: 'center',
    padding: 10,
  },
  button: {
    backgroundColor: '#754CE8',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  skipVerifyBackdoor: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});

export default PleaseBackup;
