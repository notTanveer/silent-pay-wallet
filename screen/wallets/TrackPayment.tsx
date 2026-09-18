import React, { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import SafeArea from '../../components/SafeArea';
import Button from '../../components/Button';
import InfoBanner from '../../components/InfoBanner';
import ClipboardIcon from '../../components/icons/ClipboardIcon';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import CloseIcon from '../../components/icons/CloseIcon';
import SearchTileIcon from '../../components/icons/SearchTileIcon';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { DetailViewStackParamList } from '../../navigation/DetailViewStackParamList';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';
import loc from '../../loc';
import presentAlert from '../../components/Alert';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import { ClashFont } from '../../constants/fonts';

type TrackPaymentProps = NativeStackScreenProps<DetailViewStackParamList, 'TrackPayment'>;

const TrackPayment: React.FC<TrackPaymentProps> = () => {
  const { wallets } = useStorage();
  const wallet = wallets.length > 0 ? (wallets[0] as HDSilentPaymentsWallet) : null;
  const { navigate } = useExtendedNavigation();
  const { colors } = useTheme();
  const [txid, setTxid] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const trimmedTxid = txid.trim();
  const isEmpty = trimmedTxid.length === 0;
  const isValidTxid = /^[0-9a-f]{64}$/i.test(trimmedTxid);
  const isCheckEnabled = isValidTxid && !!wallet;

  const stylesHook = StyleSheet.create({
    label: {
      color: colors.textBrand,
    },
    headline: {
      color: colors.textPrimary,
    },
    description: {
      color: colors.textSecondary,
    },
    inputContainer: {
      borderColor: isValidTxid ? colors.brandPrimary : 'transparent',
      backgroundColor: isValidTxid ? colors.background : colors.surfaceSubtle,
    },
    input: {
      color: colors.textPrimary,
    },
    pasteButton: {
      backgroundColor: colors.background,
      borderColor: colors.copyButtonBorder,
    },
    divider: {
      backgroundColor: colors.borderDefault,
    },
    statusText: {
      color: isValidTxid ? colors.successCheck : colors.statusError,
    },
    clearText: {
      color: colors.textSecondary,
    },
  });

  const handlePasteFromClipboard = useCallback(async () => {
    const clipboard = await Clipboard.getString();
    if (clipboard) {
      setTxid(clipboard.trim());
    }
  }, []);

  const handleClear = useCallback(() => setTxid(''), []);

  const handleCheckTransaction = useCallback(async () => {
    if (!wallet) return;

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const result = await wallet.scanByTxid(txid.trim());

      if (result.found) {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
        navigate('PaymentFound', {
          txid: txid.trim(),
          outputs: result.outputs,
          totalValue: result.totalValue,
          confirmations: result.confirmations,
        });
      } else if (result.bothBranchesFailed) {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
        presentAlert({ title: loc.errors.network, message: loc.wallet_birth.error_network });
      } else {
        triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
        navigate('NoPaymentFound');
      }
    } catch (error: any) {
      // an outage isn't a "no payment found" answer
      console.warn('[SP] Track payment lookup failed:', error?.message ?? error);
      triggerHapticFeedback(HapticFeedbackTypes.NotificationWarning);
      presentAlert({ title: loc.errors.network, message: loc.wallet_birth.error_network });
    } finally {
      setIsLoading(false);
    }
  }, [txid, wallet, navigate]);

  return (
    <SafeArea>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <SearchTileIcon size={80} haloBackground={colors.surfaceSubtle} tileBackground={colors.brandPrimary} />
            <Text style={[styles.label, stylesHook.label]}>{loc.track_payment.lookup_label}</Text>
            <Text style={[styles.headline, stylesHook.headline]}>{loc.track_payment.headline}</Text>
            <Text style={[styles.description, stylesHook.description]}>
              {isValidTxid ? loc.track_payment.ready_description : loc.track_payment.description}
            </Text>
          </View>

          <View style={[styles.inputContainer, stylesHook.inputContainer]}>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, stylesHook.input]}
                placeholder={loc.track_payment.txid_placeholder}
                placeholderTextColor={colors.textSecondary}
                value={txid}
                onChangeText={setTxid}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={false}
                editable={!isLoading}
                testID="TrackPaymentTxidInput"
              />
              {!isValidTxid && (
                <Pressable onPress={handlePasteFromClipboard} style={[styles.pasteButton, stylesHook.pasteButton]} testID="PasteButton">
                  <ClipboardIcon size={16} color={colors.brandPrimary} />
                </Pressable>
              )}
            </View>
            {!isEmpty && (
              <>
                <View style={[styles.divider, stylesHook.divider]} />
                <View style={styles.statusRow}>
                  <View style={styles.statusIndicator}>
                    {isValidTxid ? (
                      <CheckmarkIcon size={16} color={colors.successCheck} variant="filled" />
                    ) : (
                      <CloseIcon size={14} color={colors.statusError} />
                    )}
                    <Text style={[styles.statusText, stylesHook.statusText]}>
                      {isValidTxid ? loc.track_payment.valid_id : loc.track_payment.invalid_id}
                    </Text>
                  </View>
                  <Pressable onPress={handleClear} testID="ClearButton">
                    <Text style={[styles.clearText, stylesHook.clearText]}>{loc.track_payment.clear}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <InfoBanner title={loc.track_payment.whats_txid} text={loc.track_payment.txid_explanation} bordered badge />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={loc.track_payment.check_transaction}
            onPress={handleCheckTransaction}
            disabled={!isCheckEnabled || isLoading}
            showActivityIndicator={isLoading}
            testID="CheckTransactionButton"
            backgroundColor={colors.brandPrimary}
            buttonTextColor={colors.white}
            borderRadius={16}
            style={styles.checkButton}
            textStyle={styles.checkButtonText}
          />
        </View>
      </View>
    </SafeArea>
  );
};

export default TrackPayment;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  headline: {
    fontFamily: ClashFont.medium,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  description: {
    fontFamily: ClashFont.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  inputContainer: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: ClashFont.regular,
    fontSize: 14,
  },
  pasteButton: {
    width: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
  },
  clearText: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
  },
  buttonContainer: {
    paddingBottom: 30,
  },
  checkButton: {
    height: 56,
    minHeight: 56,
    maxHeight: 56,
  },
  checkButtonText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
  },
});
