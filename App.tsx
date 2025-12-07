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
import { initializeRustJsiBridge, helloFromRust, multiplyFromRust } from './blue_modules/RustJsiBridge';

const App = () => {
  React.useEffect(() => {
    initializeRustJsiBridge();
    try {
      console.log('Rust says:', helloFromRust());
      console.log('6 * 7 =', multiplyFromRust(6, 7));
    } catch (e) {
      console.error('Rust Bridge failed:', e);
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
