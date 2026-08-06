import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@rneui/themed';
import { CommonActions } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import SafeArea from '../../components/SafeArea';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { DetailViewStackParamList } from '../../navigation/DetailViewStackParamList';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';
import loc, { formatBalance } from '../../loc';
import { satoshiToLocalCurrency } from '../../modules/currency';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import { Spacing20 } from '../../components/Spacing';
import Button from '../../components/Button';

const CONFIRMATIONS_THRESHOLD = 6;

type PaymentFoundProps = NativeStackScreenProps<DetailViewStackParamList, 'PaymentFound'>;

const PaymentFound: React.FC<PaymentFoundProps> = ({ route }) => {
  const { txid, totalValue, confirmations } = route.params;
  const { wallets } = useStorage();
  const wallet = wallets.length > 0 ? (wallets[0] as HDSilentPaymentsWallet) : null;
  const navigation = useExtendedNavigation();
  const { colors } = useTheme();

  // Only needed for the "View Details" button, which needs a full Transaction object.
  // The amount/status shown on this screen comes straight from the scan result above,
  // since a tx can pay multiple owned outputs across both SP and regular addresses,
  // which a single getTransactions() entry can't represent.
  const tx = useMemo(() => wallet?.getTransactions().find(t => t.txid === txid) ?? null, [wallet, txid]);

  const isConfirmed = confirmations >= CONFIRMATIONS_THRESHOLD;
  const confirmationsDisplay = Math.min(confirmations, CONFIRMATIONS_THRESHOLD);
  const remaining = CONFIRMATIONS_THRESHOLD - confirmationsDisplay;
  const progressRatio = confirmationsDisplay / CONFIRMATIONS_THRESHOLD;

  const formattedBTC = formatBalance(totalValue, BitcoinUnit.BTC);
  const formattedFiat = satoshiToLocalCurrency(totalValue);

  const handleViewDetails = () => {
    if (!tx) return;
    navigation.navigate('TransactionDetails', { tx, hash: txid, walletID: wallet?.getID() ?? '' });
  };

  const handleDone = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'WalletsList' }],
      }),
    );
  };

  const confirmingColor = colors.warningColor;

  const stylesHook = StyleSheet.create({
    amount: { color: colors.foregroundColor },
    fiat: { color: colors.alternativeTextColor },
    detailsCard: { backgroundColor: colors.ballOutgoingExpired },
    rowLabel: { color: colors.alternativeTextColor },
    progressTrack: { backgroundColor: colors.formBorder },
    attentionBox: { backgroundColor: colors.ballOutgoingExpired },
    attentionText: { color: colors.foregroundColor },
    outlineButton: { borderColor: colors.formBorder },
    outlineButtonText: { color: colors.foregroundColor },
  });

  return (
    <SafeArea>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={[styles.checkmarkContainer, { backgroundColor: colors.successColor + '20' }]}>
            <Icon name="check" size={40} type="material" color={colors.successCheck} />
          </View>
          <Text style={[styles.foundItText, { color: colors.successCheck }]}>{loc.payment_found.found_it}</Text>

          <Spacing20 />

          <Text style={[styles.amount, stylesHook.amount]}>+{formattedBTC}</Text>
          <Text style={[styles.fiat, stylesHook.fiat]}>≈ {formattedFiat}</Text>

          <Spacing20 />

          <View style={[styles.detailsCard, stylesHook.detailsCard]}>
            <View style={styles.detailRow}>
              <Text style={[styles.rowLabel, stylesHook.rowLabel]}>{loc.payment_found.status}</Text>
              <Text style={[styles.statusText, { color: isConfirmed ? colors.successCheck : confirmingColor }]}>
                {isConfirmed ? loc.payment_found.confirmed : loc.payment_found.confirming_label}
              </Text>
            </View>
            <View style={[styles.progressTrackFull, stylesHook.progressTrack]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progressRatio * 100}%`, backgroundColor: isConfirmed ? colors.successCheck : confirmingColor },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.successCheck }]}>
              {confirmationsDisplay} of {CONFIRMATIONS_THRESHOLD}
            </Text>
          </View>

          <Spacing20 />

          {!isConfirmed && (
            <View style={[styles.attentionBox, stylesHook.attentionBox]}>
              <Text style={[styles.attentionHighlight, { color: confirmingColor }]}>
                {loc.payment_found.attention_highlight}{' '}
                <Text style={stylesHook.attentionText}>{loc.formatString(loc.payment_found.attention, { count: String(remaining) })}</Text>
              </Text>
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <Pressable style={[styles.outlineButton, stylesHook.outlineButton]} onPress={handleViewDetails} testID="ViewDetailsButton">
            <Text style={[styles.outlineButtonText, stylesHook.outlineButtonText]}>{loc.payment_found.view_details}</Text>
          </Pressable>
          <View style={styles.buttonSpacer} />
          <Button title={loc.payment_found.done} onPress={handleDone} testID="DoneButton" />
        </View>
      </ScrollView>
    </SafeArea>
  );
};

export default PaymentFound;

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
  },
  checkmarkContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  foundItText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  fiat: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  detailsCard: {
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 14,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressTrackFull: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    marginTop: 8,
  },
  attentionBox: {
    borderRadius: 12,
    padding: 16,
    width: '100%',
  },
  attentionHighlight: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  buttonContainer: {
    paddingBottom: 30,
    paddingTop: 20,
  },
  buttonSpacer: {
    height: 12,
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
