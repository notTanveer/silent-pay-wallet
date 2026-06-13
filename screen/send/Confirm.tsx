import React, { useEffect, useMemo, useReducer } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@rneui/themed';
import BigNumber from 'bignumber.js';
import * as bitcoin from 'bitcoinjs-lib';
import Clipboard from '@react-native-clipboard/clipboard';
import Svg, { Path } from 'react-native-svg';
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
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
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
  const route = useRoute<ConfirmRouteProp>();
  const { recipients, walletID, fee, tx, splitOutputCount, spRecipientAddress } = route.params;
  const isSplit = (splitOutputCount ?? 0) > 1;

  const [state, dispatch] = useReducer(reducer, initialState);
  const { navigate, goBack } = navigation;
  const wallet = wallets.find((w: TWallet) => w.getID() === walletID) as TWallet;
  const feeSatoshi = new BigNumber(fee).multipliedBy(100000000).toNumber();
  const { colors } = useTheme();
  const [copiedAddr, setCopiedAddr] = React.useState(false);
  const [copiedTxid, setCopiedTxid] = React.useState(false);
  const [copiedOutputs, setCopiedOutputs] = React.useState<Record<number, boolean>>({});

  const stylesHook = StyleSheet.create({
    root: { backgroundColor: colors.elevated },
    divider: { backgroundColor: colors.divider },
    summaryLabel: { color: colors.amountMeta },
    summaryValue: { color: colors.black },
    totalLabel: { color: colors.textPrimary },
    totalValue: { color: colors.brandPrimary },
    sendNowButton: { backgroundColor: colors.brandPrimary },
    sendNowButtonDisabled: { backgroundColor: colors.ctaDisabled },
    sendNowText: { color: colors.white },
    splitSectionTitle: { color: colors.brandPrimary },
    outputLabel: { color: colors.textPrimary },
    outputAmount: { color: colors.textPrimary },
    outputAddressCard: { backgroundColor: colors.elevated },
    outputAddressLabel: { color: colors.amountMeta },
    outputAddressText: { color: colors.textPrimary },
    outputCopyBtn: { borderColor: colors.copyButtonBorder },
    outputSeparator: { backgroundColor: colors.divider },
    spAddressRow: { borderColor: '#F5F5F5', backgroundColor: colors.elevated },
    spIconCircle: { backgroundColor: colors.surfaceSubtle },
    spAddressText: { color: colors.brandPrimary },
  });

  useEffect(() => {
    if (!wallet) {
      goBack();
    }
  }, [wallet, goBack]);

  const handleSendTransaction = async () => {
    dispatch({ type: ActionType.SET_BUTTON_DISABLED, payload: true });
    dispatch({ type: ActionType.SET_LOADING, payload: true });
    try {
      if (await isBiometricUseCapableAndEnabled()) {
        if (!(await unlockWithBiometrics())) {
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
  const amountSats = isSplit ? recipients.reduce((sum, r) => sum + (r.value ?? 0), 0) : (recipient?.value ?? 0);
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

  const copyOutput = (index: number, text: string) => {
    Clipboard.setString(text);
    triggerHapticFeedback(HapticFeedbackTypes.Selection);
    setCopiedOutputs(prev => ({ ...prev, [index]: true }));
    setTimeout(() => setCopiedOutputs(prev => ({ ...prev, [index]: false })), 1000);
  };

  return (
    <SafeArea style={[styles.root, stylesHook.root]}>
      <ScrollView style={styles.contentScroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AmountHero amount={satoshiToBTC(amountSats)} fiat={`≈ ${satoshiToLocalCurrency(amountSats)}`} />

        <View style={[styles.divider, stylesHook.divider]} />

        {isSplit ? (
          <>
            <Text style={[styles.splitSectionTitle, stylesHook.splitSectionTitle]}>
              {loc.formatString(loc.send.split_into_outputs, { count: splitOutputCount ?? recipients.length })}
            </Text>

            <View style={styles.splitOutputsCard}>
              {recipients.map((r, i) => (
                <React.Fragment key={`output-${i}`}>
                  <View style={styles.outputHeaderRow}>
                    <Text style={[styles.outputLabel, stylesHook.outputLabel]}>{`Output ${i + 1}`}</Text>
                    <Text style={[styles.outputAmount, stylesHook.outputAmount]}>
                      {`${satoshiToBTC(r.value ?? 0)} ${loc.units[BitcoinUnit.BTC]}`}
                    </Text>
                  </View>
                  <View style={[styles.outputAddressCard, stylesHook.outputAddressCard]}>
                    <View style={styles.outputAddressHeader}>
                      <Text style={[styles.outputAddressLabel, stylesHook.outputAddressLabel]}>{loc.send.onchain_address_derived}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => copyOutput(i, r.address ?? '')}
                        style={[styles.outputCopyBtn, stylesHook.outputCopyBtn]}
                      >
                        <CopyIcon size={16} color={copiedOutputs[i] ? colors.brandPrimary : colors.chevron} />
                      </Pressable>
                    </View>
                    <Text style={[styles.outputAddressText, stylesHook.outputAddressText]} numberOfLines={2}>
                      {r.address}
                    </Text>
                  </View>
                  {i < recipients.length - 1 && <View style={[styles.outputSeparator, stylesHook.outputSeparator]} />}
                </React.Fragment>
              ))}

              {spRecipientAddress && (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.spAddressRow, stylesHook.spAddressRow]}
                  onPress={() => copy(spRecipientAddress, () => {})}
                >
                  <View style={[styles.spIconCircle, stylesHook.spIconCircle]}>
                    <Svg width={12} height={12} viewBox="0 0 14 14" fill="none">
                      <Path d="M2 7a5 5 0 1010 0A5 5 0 002 7z" stroke={colors.brandPrimary} strokeWidth={1.17} />
                      <Path d="M4.667 7h4.666" stroke={colors.brandPrimary} strokeWidth={1.17} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <Text style={[styles.spAddressText, stylesHook.spAddressText]} numberOfLines={1}>
                    {loc.send.recipients_sp_address}
                  </Text>
                  <View style={styles.chevronDown}>
                    <ChevronRightIcon color="#545454" size={18} />
                  </View>
                </Pressable>
              )}
            </View>

            <View style={styles.splitFeeSection}>
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
          </>
        ) : (
          <>
            <ConfirmDetailRow
              label={loc.send.onchain_address_derived}
              value={recipient?.address ?? ''}
              mono
              copied={copiedAddr}
              onCopy={() => copy(recipient?.address ?? '', setCopiedAddr)}
            />
            <View style={[styles.divider, stylesHook.divider]} />

            <ConfirmDetailRow
              label={loc.send.transaction_id}
              value={txid}
              mono
              copied={copiedTxid}
              onCopy={() => copy(txid, setCopiedTxid)}
            />
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
          </>
        )}
      </ScrollView>

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
  },
  contentScroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
    paddingBottom: 8,
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
  splitSectionTitle: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 20,
  },
  splitOutputsCard: {
    borderRadius: 12,
    backgroundColor: '#F9F9FB',
    padding: 16,
    gap: 8,
  },
  outputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outputLabel: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 26,
  },
  outputAmount: {
    fontFamily: ClashFont.medium,
    fontSize: 12,
    lineHeight: 26,
  },
  outputAddressCard: {
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  outputAddressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outputAddressLabel: {
    fontFamily: ClashFont.regular,
    fontSize: 12,
    lineHeight: 26,
  },
  outputAddressText: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  outputCopyBtn: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outputSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  spAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  spIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spAddressText: {
    flex: 1,
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  chevronDown: {
    transform: [{ rotate: '90deg' }],
  },
  splitFeeSection: {
    gap: 8,
    paddingTop: 4,
  },
});
