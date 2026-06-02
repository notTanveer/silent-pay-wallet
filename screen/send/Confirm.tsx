import React, { useEffect, useMemo, useReducer } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@rneui/themed';
import BigNumber from 'bignumber.js';
import * as bitcoin from 'bitcoinjs-lib';
import Clipboard from '@react-native-clipboard/clipboard';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import loc, { formatBalanceWithoutSuffix } from '../../loc';
import { useRoute, RouteProp } from '@react-navigation/native';
import presentAlert from '../../components/Alert';
import { useTheme } from '../../components/themes';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import SafeArea from '../../components/SafeArea';
import { satoshiToBTC, satoshiToLocalCurrency } from '../../modules/currency';
import * as Electrum from '../../modules/Electrum';
import { unlockWithBiometrics, useBiometrics } from '../../hooks/useBiometrics';
import { TWallet } from '../../class/wallets/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SendDetailsStackParamList } from '../../navigation/SendDetailsStackParamList';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { useStorage } from '../../hooks/context/useStorage';
import { useSettings } from '../../hooks/context/useSettings';
import AmountHero from '../../components/AmountHero';
import CopyIcon from '../../components/icons/CopyIcon';
import SendIcon from '../../components/icons/SendIcon';
import { ClashFont } from '../../constants/fonts';
import { computeTotalSats } from '../../helpers/send/format';

enum ActionType {
  SET_LOADING = 'SET_LOADING',
  SET_BUTTON_DISABLED = 'SET_BUTTON_DISABLED',
}

type Action = { type: ActionType.SET_LOADING; payload: boolean } | { type: ActionType.SET_BUTTON_DISABLED; payload: boolean };

interface State {
  isLoading: boolean;
  isButtonDisabled: boolean;
}

const initialState: State = {
  isLoading: false,
  isButtonDisabled: false,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case ActionType.SET_LOADING:
      return { ...state, isLoading: action.payload };
    case ActionType.SET_BUTTON_DISABLED:
      return { ...state, isButtonDisabled: action.payload };
    default:
      return state;
  }
};

type ConfirmRouteProp = RouteProp<SendDetailsStackParamList, 'Confirm'>;
type ConfirmNavigationProp = NativeStackNavigationProp<SendDetailsStackParamList, 'Confirm'>;

const ConfirmDetailRow: React.FC<{ label: string; value: string; mono?: boolean; onCopy?: () => void; copied?: boolean }> = ({
  label,
  value,
  mono,
  onCopy,
  copied,
}) => {
  const { colors } = useTheme();
  const stylesHook = StyleSheet.create({
    label: { color: colors.textPrimary },
    value: { color: colors.textPrimary },
    copyBtn: { borderColor: colors.copyButtonBorder },
  });
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailHead}>
        <Text style={[styles.detailLabel, stylesHook.label]}>{label}</Text>
        {onCopy && (
          <Pressable accessibilityRole="button" onPress={onCopy} style={[styles.copyBtn, stylesHook.copyBtn]}>
            <CopyIcon size={16} color={copied ? colors.brandPrimary : colors.chevron} />
          </Pressable>
        )}
      </View>
      <Text style={[mono ? styles.detailMono : styles.detailValue, stylesHook.value]}>{value}</Text>
    </View>
  );
};

const Confirm: React.FC = () => {
  const { wallets, fetchAndSaveWalletTransactions } = useStorage();
  const { isElectrumDisabled } = useSettings();
  const { isBiometricUseCapableAndEnabled } = useBiometrics();
  const navigation = useExtendedNavigation<ConfirmNavigationProp>();
  const route = useRoute<ConfirmRouteProp>(); // Get the route and its params
  const { recipients, walletID, fee, memo, tx, satoshiPerByte } = route.params;

  const [state, dispatch] = useReducer(reducer, initialState);
  const { navigate, setOptions, goBack } = navigation;
  const wallet = wallets.find((w: TWallet) => w.getID() === walletID) as TWallet;
  const feeSatoshi = new BigNumber(fee).multipliedBy(100000000).toNumber();
  const { colors } = useTheme();
  const [copiedAddr, setCopiedAddr] = React.useState(false);
  const [copiedTxid, setCopiedTxid] = React.useState(false);

  const stylesHook = StyleSheet.create({
    root: { backgroundColor: colors.elevated },
    txDetails: { backgroundColor: colors.lightButton },
    valueUnit: { color: colors.buttonTextColor },
    divider: { backgroundColor: colors.divider },
    summaryLabel: { color: colors.amountMeta },
    summaryValue: { color: colors.black },
    totalLabel: { color: colors.textPrimary },
    totalValue: { color: colors.brandPrimary },
    sendNowButton: { backgroundColor: colors.brandPrimary },
    sendNowButtonDisabled: { backgroundColor: colors.ctaDisabled },
    sendNowText: { color: colors.white },
  });

  useEffect(() => {
    if (!wallet) {
      goBack();
    }
  }, [wallet, goBack]);

  const HeaderRightButton = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        testID="TransactionDetailsButton"
        style={[styles.txDetails, stylesHook.txDetails]}
        onPress={async () => {
          if (await isBiometricUseCapableAndEnabled()) {
            if (!(await unlockWithBiometrics())) {
              return;
            }
          }
          navigate('CreateTransaction', {
            fee,
            recipients,
            memo,
            tx,
            satoshiPerByte,
            feeSatoshi,
          });
        }}
      >
        <Text style={[styles.txText, stylesHook.valueUnit]}>{loc.send.create_details}</Text>
      </Pressable>
    ),
    [
      stylesHook.txDetails,
      stylesHook.valueUnit,
      isBiometricUseCapableAndEnabled,
      navigate,
      fee,
      recipients,
      memo,
      tx,
      satoshiPerByte,
      feeSatoshi,
    ],
  );

  useEffect(() => {
    console.log('send/confirm - useEffect');
    console.log('address = ', recipients);
  }, [recipients]);

  useEffect(() => {
    setOptions({
      headerRight: () => HeaderRightButton,
    });
  }, [HeaderRightButton, colors, fee, feeSatoshi, memo, recipients, satoshiPerByte, setOptions, tx, wallet]);

  const handleSendTransaction = async () => {
    dispatch({ type: ActionType.SET_BUTTON_DISABLED, payload: true });
    dispatch({ type: ActionType.SET_LOADING, payload: true });
    try {
      // Perform biometric authentication first
      if (await isBiometricUseCapableAndEnabled()) {
        if (!(await unlockWithBiometrics())) {
          // Stop execution if biometric unlock fails
          dispatch({ type: ActionType.SET_LOADING, payload: false });
          dispatch({ type: ActionType.SET_BUTTON_DISABLED, payload: false });
          return;
        }
      }

      const txidsToWatch = [];
      const result = await broadcastTransaction(tx);
      if (!result) {
        dispatch({ type: ActionType.SET_LOADING, payload: false });
        dispatch({ type: ActionType.SET_BUTTON_DISABLED, payload: false });
        return;
      }

      const txid = bitcoin.Transaction.fromHex(tx).getId();
      txidsToWatch.push(txid);
      let amount = 0;
      for (const recipient of recipients) {
        if (recipient.value) {
          amount += recipient.value;
        }
      }

      amount = Number(formatBalanceWithoutSuffix(amount, BitcoinUnit.BTC, false));
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
      navigate('Success', {
        fee: Number(fee),
        amount,
        txid,
      });

      dispatch({ type: ActionType.SET_LOADING, payload: false });

      await new Promise(resolve => setTimeout(resolve, 3000)); // sleep to make sure network propagates
      fetchAndSaveWalletTransactions(walletID);
    } catch (error: any) {
      triggerHapticFeedback(HapticFeedbackTypes.NotificationError);
      dispatch({ type: ActionType.SET_LOADING, payload: false });
      dispatch({ type: ActionType.SET_BUTTON_DISABLED, payload: false });
      presentAlert({ message: error.message });
    }
  };

  const broadcastTransaction = async (transaction: string) => {
    await Electrum.ping();
    await Electrum.waitTillConnected();

    const result = await wallet.broadcastTx(transaction);
    if (!result) {
      throw new Error(loc.errors.broadcast);
    }

    return result;
  };

  const recipient = recipients[0];
  const amountSats = recipient?.value ?? 0;
  const txid = useMemo(() => {
    try {
      return tx ? bitcoin.Transaction.fromHex(tx).getId() : '';
    } catch {
      return '';
    }
  }, [tx]);
  const totalSats = computeTotalSats(amountSats, feeSatoshi);
  const copy = (text: string, setFlag: (b: boolean) => void) => {
    Clipboard.setString(text);
    triggerHapticFeedback(HapticFeedbackTypes.Selection);
    setFlag(true);
    setTimeout(() => setFlag(false), 1000);
  };

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <View style={styles.content}>
        <AmountHero amount={String(satoshiToBTC(amountSats))} fiat={`≈ ${satoshiToLocalCurrency(amountSats)}`} />

        <View style={[styles.divider, stylesHook.divider]} />

        <ConfirmDetailRow
          label={loc.send.onchain_address_derived}
          value={recipient?.address ?? ''}
          mono
          copied={copiedAddr}
          onCopy={() => copy(recipient?.address ?? '', setCopiedAddr)}
        />
        <View style={[styles.divider, stylesHook.divider]} />

        <ConfirmDetailRow label={loc.send.transaction_id} value={txid} mono copied={copiedTxid} onCopy={() => copy(txid, setCopiedTxid)} />
        <View style={[styles.divider, stylesHook.divider]} />

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, stylesHook.summaryLabel]}>{loc.send.create_fee}</Text>
          <Text style={[styles.summaryValue, stylesHook.summaryValue]}>
            {satoshiToBTC(feeSatoshi)} {loc.units[BitcoinUnit.BTC]} ({satoshiToLocalCurrency(feeSatoshi)})
          </Text>
        </View>
        <View style={[styles.divider, stylesHook.divider]} />

        <View style={styles.summaryRow}>
          <Text style={[styles.totalLabel, stylesHook.totalLabel]}>{loc.send.total}</Text>
          <Text style={[styles.totalValue, stylesHook.totalValue]}>
            {satoshiToBTC(totalSats)} {loc.units[BitcoinUnit.BTC]}
          </Text>
        </View>
      </View>

      <View style={styles.bottom}>
        {state.isLoading ? (
          <ActivityIndicator />
        ) : (
          <Pressable
            accessibilityRole="button"
            testID="sendNowButton"
            disabled={isElectrumDisabled || state.isButtonDisabled}
            onPress={handleSendTransaction}
            style={[
              styles.sendNowButton,
              stylesHook.sendNowButton,
              (isElectrumDisabled || state.isButtonDisabled) && stylesHook.sendNowButtonDisabled,
            ]}
          >
            <SendIcon size={20} color={colors.white} />
            <Text style={[styles.sendNowText, stylesHook.sendNowText]}>{loc.send.confirm_sendNow}</Text>
          </Pressable>
        )}
      </View>
    </SafeArea>
  );
};

export default Confirm;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 19,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  detailRow: {
    gap: 4,
    paddingVertical: 8,
  },
  detailHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 26,
  },
  detailValue: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  detailMono: {
    fontFamily: ClashFont.regular,
    fontSize: 12,
    lineHeight: 26,
  },
  copyBtn: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 26,
  },
  summaryValue: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 26,
  },
  totalLabel: {
    fontFamily: ClashFont.regular,
    fontSize: 12,
    lineHeight: 20,
  },
  totalValue: {
    fontFamily: ClashFont.semibold,
    fontSize: 14,
    lineHeight: 26,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  sendNowButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  sendNowText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  txDetails: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    borderRadius: 8,
    height: 38,
  },
  txText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
