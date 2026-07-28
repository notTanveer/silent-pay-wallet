import React from 'react';
import { Keyboard } from 'react-native';
import { NativeStackNavigationOptions, createNativeStackNavigator } from '@react-navigation/native-stack';
import navigationStyle from '../components/navigationStyle';
import HeaderBackButton from '../components/HeaderBackButton';
import { Theme, useTheme } from '../components/themes';
import loc from '../loc';
import {
  CoinControlComponent,
  ConfirmComponent,
  CreateTransactionComponent,
  PsbtWithHardwareWalletComponent,
  SendDetailsComponent,
  SuccessComponent,
} from './LazyLoadSendDetailsStack';
import { SendDetailsStackParamList } from './SendDetailsStackParamList';
import { BitcoinUnit } from '../models/bitcoinUnits';
import { ScanQRCodeComponent } from './LazyLoadScanQRCodeStack';
import SelectFeeScreen from '../screen/SelectFeeScreen';

const Stack = createNativeStackNavigator<SendDetailsStackParamList>();

// SendDetails is the initial route of this nested stack (index 0), so navigationStyle's
// default back chevron doesn't apply to it and it needs its own headerLeft.
const withBackChevron = (
  options: NativeStackNavigationOptions,
  { theme, navigation }: { theme: Theme; navigation: any },
): NativeStackNavigationOptions => ({
  ...options,
  headerLeft: () => (
    <HeaderBackButton
      color={theme.colors.foregroundColor}
      onPress={() => {
        Keyboard.dismiss();
        navigation.goBack();
      }}
    />
  ),
});

const SendDetailsStack = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator initialRouteName="SendDetails" screenOptions={{ headerShadowVisible: false, fullScreenGestureEnabled: false }}>
      <Stack.Screen
        name="SendDetails"
        component={SendDetailsComponent}
        options={navigationStyle(
          {
            title: loc.send.header,
            statusBarStyle: 'light',
          },
          withBackChevron,
        )(theme)}
        initialParams={{ isEditable: true, feeUnit: BitcoinUnit.BTC, amountUnit: BitcoinUnit.BTC }} // Correctly typed now
      />
      <Stack.Screen name="SelectFee" component={SelectFeeScreen} options={navigationStyle({ title: loc.send.network_fee_header })(theme)} />
      <Stack.Screen name="Confirm" component={ConfirmComponent} options={navigationStyle({ title: loc.send.confirm_header })(theme)} />
      <Stack.Screen
        name="PsbtWithHardwareWallet"
        component={PsbtWithHardwareWalletComponent}
        options={navigationStyle({ title: loc.send.header, gestureEnabled: false, fullScreenGestureEnabled: false })(theme)}
      />
      <Stack.Screen
        name="CreateTransaction"
        component={CreateTransactionComponent}
        options={navigationStyle({ title: loc.send.create_details })(theme)}
      />
      <Stack.Screen
        name="Success"
        component={SuccessComponent}
        options={navigationStyle({ headerShown: false, gestureEnabled: false, presentation: 'transparentModal' })(theme)}
      />
      <Stack.Screen name="CoinControl" component={CoinControlComponent} options={navigationStyle({ title: loc.cc.header })(theme)} />
      <Stack.Screen
        name="ScanQRCode"
        component={ScanQRCodeComponent}
        options={navigationStyle({
          headerShown: false,
          statusBarHidden: true,
          presentation: 'fullScreenModal',
          headerShadowVisible: false,
        })(theme)}
      />
    </Stack.Navigator>
  );
};

export default SendDetailsStack;
