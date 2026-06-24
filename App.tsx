import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SizeClassProvider } from './components/Context/SizeClassProvider';
import { SettingsProvider } from './components/Context/SettingsProvider';
import { ShroudDefaultTheme, ShroudDarkTheme } from './components/themes';
import MasterView from './navigation/MasterView';
import { navigationRef } from './NavigationService';
import { useLogger } from '@react-navigation/devtools';
import { StorageProvider } from './components/Context/StorageProvider';
import { initializeIndexer } from './modules/SilentPaymentIndexer';
import { initializeRustJsiBridge } from './modules/RustJsiBridge';
import { INDEXER_BASE_URL } from '@env';
import { useColorScheme } from 'react-native';

const App = () => {
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (!INDEXER_BASE_URL) throw new Error('INDEXER_BASE_URL is not set');
    initializeRustJsiBridge();
    initializeIndexer({
      baseUrl: INDEXER_BASE_URL,
      timeout: 100000,
    });
  }, []);

  useLogger(navigationRef);

  return (
    <SizeClassProvider>
      <NavigationContainer ref={navigationRef} theme={colorScheme === 'dark' ? ShroudDarkTheme : ShroudDefaultTheme}>
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
