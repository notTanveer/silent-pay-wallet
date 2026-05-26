import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SizeClassProvider } from './components/Context/SizeClassProvider';
import { SettingsProvider } from './components/Context/SettingsProvider';
import { BlueDefaultTheme } from './components/themes';
import MasterView from './navigation/MasterView';
import { navigationRef } from './NavigationService';
import { useLogger } from '@react-navigation/devtools';
import { StorageProvider } from './components/Context/StorageProvider';
import { initializeIndexer } from './modules/SilentPaymentIndexer';
import { initializeRustJsiBridge } from './modules/RustJsiBridge';
import { INDEXER_BASE_URL } from '@env';

const App = () => {
  initializeRustJsiBridge();

  if (!INDEXER_BASE_URL) throw new Error('INDEXER_BASE_URL is not set');

  initializeIndexer({
    baseUrl: INDEXER_BASE_URL,
    timeout: 100000, // 100 seconds for blockchain scanning operations (increased for slower connections)
  });

  useLogger(navigationRef);

  return (
    <SizeClassProvider>
      <NavigationContainer ref={navigationRef} theme={BlueDefaultTheme}>
        <SafeAreaProvider>
          <StorageProvider>
            <SettingsProvider>
              <MasterView />
            </SettingsProvider>
          </StorageProvider>
        </SafeAreaProvider>
      </NavigationContainer>
    </SizeClassProvider>
  );
};

export default App;
