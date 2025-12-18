import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SizeClassProvider } from './components/Context/SizeClassProvider';
import { SettingsProvider } from './components/Context/SettingsProvider';
import { BlueDarkTheme, BlueDefaultTheme } from './components/themes';
import MasterView from './navigation/MasterView';
import { navigationRef } from './NavigationService';
import { useLogger } from '@react-navigation/devtools';
import { StorageProvider } from './components/Context/StorageProvider';
import { initializeIndexer } from './blue_modules/SilentPaymentIndexer';
import { initializeRustJsiBridge } from './blue_modules/RustJsiBridge';

const App = () => {
  // Initialize Rust JSI Bridge for high-performance Silent Payment scanning
  React.useEffect(() => {
    const success = initializeRustJsiBridge();
    if (success) {
      console.log('[App] ✅ Rust JSI Bridge initialized');
    } else {
      console.warn('[App] ⚠️ Rust JSI Bridge failed to initialize - falling back to JS implementation');
    }
  }, []);

  initializeIndexer({
    baseUrl: 'https://cushionlike-isabel-retrievable.ngrok-free.dev/',
    timeout: 100000, // 100 seconds for blockchain scanning operations (increased for slower connections)
  });
  

  const colorScheme = useColorScheme();

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
