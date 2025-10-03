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
// import { initializeIndexer } from './blue_modules/SilentPaymentIndexer';

const App = () => {


  // TODO: UNCOMMENT AND CONFIGURE THE INDEXER HERE, ONCE PUBLISHED

  // useEffect(() => {
  //   initializeIndexer({
  //     baseUrl: process.env.INDEXER_URL || 'http://localhost:3000',
  //     timeout: 30000
  //   });
  // }, []);
  

  const colorScheme = useColorScheme();

  useLogger(navigationRef);

  return (
    <SizeClassProvider>
      <NavigationContainer ref={navigationRef} theme={colorScheme === 'dark' ? BlueDarkTheme : BlueDefaultTheme}>
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
