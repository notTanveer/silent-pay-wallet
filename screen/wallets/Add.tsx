import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Alert, Keyboard, LayoutAnimation, Platform, StyleSheet, TextInput, useColorScheme, View } from 'react-native';

import { BlueFormLabel } from '../../BlueComponents';
import { HDSegwitBech32Wallet, HDSegwitP2SHWallet, SegwitP2SHWallet } from '../../class';
import { useTheme } from '../../components/themes';
import WalletButton from '../../components/WalletButton';
import loc from '../../loc';
import { Chain } from '../../models/bitcoinUnits';
import { CommonToolTipActions } from '../../typings/CommonToolTipActions';
import { Action } from '../../components/types';
import HeaderMenuButton from '../../components/HeaderMenuButton';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AddWalletStackParamList } from '../../navigation/AddWalletStack';
import { RouteProp, useRoute } from '@react-navigation/native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import { BlueSpacing20 } from '../../components/BlueSpacing';

enum ButtonSelected {
  // @ts-ignore: Return later to update
  ONCHAIN = Chain.ONCHAIN,
}

interface State {
  isLoading: boolean;
  selectedIndex: number;
  label: string;
  selectedWalletType: ButtonSelected;
}

const ActionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_SELECTED_INDEX: 'SET_SELECTED_INDEX',
  SET_LABEL: 'SET_LABEL',
  SET_SELECTED_WALLET_TYPE: 'SET_SELECTED_WALLET_TYPE',
} as const;
type ActionTypes = (typeof ActionTypes)[keyof typeof ActionTypes];

interface TAction {
  type: ActionTypes;
  payload?: any;
}

const initialState: State = {
  isLoading: false,
  selectedIndex: 0,
  label: '',
  selectedWalletType: ButtonSelected.ONCHAIN,
};

const walletReducer = (state: State, action: TAction): State => {
  switch (action.type) {
    case ActionTypes.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case ActionTypes.SET_SELECTED_INDEX:
      return { ...state, selectedIndex: action.payload, selectedWalletType: ButtonSelected.ONCHAIN };
    case ActionTypes.SET_LABEL:
      return { ...state, label: action.payload };
    case ActionTypes.SET_SELECTED_WALLET_TYPE:
      return { ...state, selectedWalletType: action.payload };
    default:
      return state;
  }
};

type NavigationProps = NativeStackNavigationProp<AddWalletStackParamList, 'AddWallet'>;

type RouteProps = RouteProp<AddWalletStackParamList, 'AddWallet'>;

const WalletsAdd: React.FC = () => {
  const { colors } = useTheme();

  // State
  const [state, dispatch] = useReducer(walletReducer, initialState);
  const isLoading = state.isLoading;
  const selectedIndex = state.selectedIndex;
  const label = state.label;
  const selectedWalletType = state.selectedWalletType;
  const colorScheme = useColorScheme();
  const { entropy: entropyHex, words } = useRoute<RouteProps>().params || {};
  const entropy = entropyHex ? Buffer.from(entropyHex, 'hex') : undefined;
  const { navigate, setOptions, setParams } = useExtendedNavigation<NavigationProps>();
  const stylesHook = {
    advancedText: {
      color: colors.feeText,
    },
    label: {
      borderColor: colors.formBorder,
      borderBottomColor: colors.formBorder,
      backgroundColor: colors.inputBackgroundColor,
    },
    noPadding: {
      backgroundColor: colors.elevated,
    },
    root: {
      backgroundColor: colors.elevated,
    },
  };

  const entropyButtonText = useMemo(() => {
    if (!entropy) {
      return loc.wallets.add_entropy_provide;
    }
    return loc.formatString(loc.wallets.add_entropy_bytes, {
      bytes: entropy?.length,
    });
  }, [entropy]);

  const confirmResetEntropy = useCallback(
    (newWalletType: ButtonSelected) => {
      if (entropy || words) {
        Alert.alert(
          loc.wallets.add_entropy_reset_title,
          loc.wallets.add_entropy_reset_message,
          [
            {
              text: loc._.cancel,
              style: 'cancel',
            },
            {
              text: loc._.ok,
              style: 'destructive',
              onPress: () => {
                setParams({ entropy: undefined, words: undefined });
                setSelectedWalletType(newWalletType);
              },
            },
          ],
          { cancelable: true },
        );
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedWalletType(newWalletType);
      }
    },
    [entropy, setParams, words],
  );

  const toolTipActions = useMemo(() => {
    const walletSubactions: Action[] = [
      {
        id: HDSegwitBech32Wallet.type,
        text: `${loc.multisig.native_segwit_title}`,
        subtitle: 'p2wsh/HD',
        menuState: selectedIndex === 0 && selectedWalletType === ButtonSelected.ONCHAIN,
      },
      {
        id: SegwitP2SHWallet.type,
        text: `${loc.multisig.wrapped_segwit_title}`,
        subtitle: 'p2sh-p2wsh/HD',
        menuState: selectedIndex === 1 && selectedWalletType === ButtonSelected.ONCHAIN,
      },
      {
        id: HDSegwitP2SHWallet.type,
        text: `${loc.multisig.legacy_title}`,
        subtitle: 'p2sh/non-HD',
        menuState: selectedIndex === 2 && selectedWalletType === ButtonSelected.ONCHAIN,
      },
    ];

    const walletAction: Action = {
      id: 'wallets',
      text: loc.multisig.wallet_type,
      subactions: walletSubactions,
      displayInline: true,
    };

    const entropySubActions: Action[] = [
      {
        id: '12_words',
        text: loc.wallets.add_wallet_seed_length_12,
        subtitle: loc.wallets.add_wallet_seed_length,
        menuState: words === 12,
      },
      {
        id: '24_words',
        text: loc.wallets.add_wallet_seed_length_24,
        subtitle: loc.wallets.add_wallet_seed_length,
        menuState: words === 24,
      },
      { ...CommonToolTipActions.ResetToDefault, hidden: !entropy },
    ];

    const entropyActions: Action = {
      ...CommonToolTipActions.Entropy,
      text: entropyButtonText,
      subactions: entropySubActions,
    };

    return [walletAction, entropyActions];
  }, [selectedWalletType, selectedIndex, entropy, words, entropyButtonText]);

  const HeaderRight = useMemo(
    () => (
      <HeaderMenuButton
        onPressMenuItem={(id: string) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          if (id === HDSegwitBech32Wallet.type) {
            setSelectedIndex(0);
          } else if (id === SegwitP2SHWallet.type) {
            setSelectedIndex(1);
          } else if (id === HDSegwitP2SHWallet.type) {
            setSelectedIndex(2);
          } else if (id === '12_words') {
            navigate('ProvideEntropy', { words: 12, entropy: entropy?.toString('hex') });
          } else if (id === '24_words') {
            navigate('ProvideEntropy', { words: 24, entropy: entropy?.toString('hex') });
          } else if (id === CommonToolTipActions.ResetToDefault.id) {
            confirmResetEntropy(ButtonSelected.ONCHAIN);
          }
        }}
        actions={toolTipActions}
      />
    ),
    [toolTipActions, entropy, confirmResetEntropy, navigate],
  );

  useEffect(() => {
    setOptions({
      headerRight: () => HeaderRight,
      statusBarStyle: Platform.select({ ios: 'light', default: colorScheme === 'dark' ? 'light' : 'dark' }),
    });
  }, [HeaderRight, colorScheme, colors.foregroundColor, setOptions, toolTipActions]);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const setIsLoading = (value: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: value });
  };

  const setSelectedIndex = (value: number) => {
    dispatch({ type: 'SET_SELECTED_INDEX', payload: value });
  };

  const setLabel = (value: string) => {
    dispatch({ type: 'SET_LABEL', payload: value });
  };

  const setSelectedWalletType = (value: ButtonSelected) => {
    dispatch({ type: 'SET_SELECTED_WALLET_TYPE', payload: value });
  };

  const handleOnBitcoinButtonPressed = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Keyboard.dismiss();
    setSelectedWalletType(ButtonSelected.ONCHAIN);
  };

  return (
    <SafeAreaScrollView
      style={stylesHook.root}
      testID="ScrollView"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustContentInsets
      automaticallyAdjustsScrollIndicatorInsets
    >
      <BlueSpacing20 />
      <BlueFormLabel>{loc.wallets.add_wallet_name}</BlueFormLabel>
      <View style={[styles.label, stylesHook.label]}>
        <TextInput
          testID="WalletNameInput"
          value={label}
          placeholderTextColor="#81868e"
          placeholder={loc.wallets.add_placeholder}
          onChangeText={setLabel}
          style={styles.textInputCommon}
          editable={!isLoading}
          underlineColorAndroid="transparent"
        />
      </View>
      <BlueFormLabel>{loc.wallets.add_wallet_type}</BlueFormLabel>
      <View style={styles.buttons}>
        <WalletButton
          buttonType="Bitcoin"
          testID="ActivateBitcoinButton"
          active={selectedWalletType === ButtonSelected.ONCHAIN}
          onPress={handleOnBitcoinButtonPressed}
          size={styles.button}
        />
      </View>
    </SafeAreaScrollView>
  );
};

const styles = StyleSheet.create({
  label: {
    flexDirection: 'row',
    borderWidth: 1,
    borderBottomWidth: 0.5,
    minHeight: 44,
    height: 44,
    marginHorizontal: 20,
    alignItems: 'center',
    marginVertical: 16,
    borderRadius: 4,
  },
  textInputCommon: {
    flex: 1,
    marginHorizontal: 8,
    color: '#81868e',
  },
  buttons: {
    flexDirection: 'column',
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 0,
    minHeight: 100,
  },
  button: {
    width: '100%',
    height: 'auto',
  },
});

export default WalletsAdd;
