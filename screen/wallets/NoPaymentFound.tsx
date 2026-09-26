import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import SafeArea from '../../components/SafeArea';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { HDSilentPaymentsWallet } from '../../class/wallets/hd-bip352-wallet';
import loc from '../../loc';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import ActionButton from '../../components/ActionButton';
import NotFoundTileIcon from '../../components/icons/NotFoundTileIcon';
import CopyIcon from '../../components/icons/CopyIcon';
import { ClashFont } from '../../constants/fonts';
import { splitForEmphasis } from '../../helpers/emphasis';

const NoPaymentFound: React.FC = () => {
  const { wallets } = useStorage();
  const wallet = wallets.length > 0 ? (wallets[0] as HDSilentPaymentsWallet) : null;
  const navigation = useExtendedNavigation();
  const { colors } = useTheme();

  const reasons = useMemo(
    () => [
      loc.no_payment_found.reason_not_broadcast,
      loc.no_payment_found.reason_different_address,
      loc.no_payment_found.reason_incorrect_txid,
      loc.no_payment_found.reason_not_silent_payment,
    ],
    [],
  );

  const spAddress = useMemo(() => wallet?.getSilentPaymentAddress() ?? '', [wallet]);

  const [tipBefore, tipMatch, tipAfter] = splitForEmphasis(loc.no_payment_found.tip_text, loc.no_payment_found.tip_emphasis);

  const handleCopyAddress = useCallback(() => {
    if (!spAddress) return;
    Clipboard.setString(spAddress);
    triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
  }, [spAddress]);

  // Track Payment is this screen's only entry point, so going back always lands there.
  const handleCheckAnotherTxid = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const stylesHook = StyleSheet.create({
    nothingDetected: { color: colors.notFoundTileHeading },
    heading: { color: colors.textPrimary },
    subheading: { color: colors.textSecondary },
    reasonsBox: { backgroundColor: colors.surfaceSubtle },
    reasonsTitle: { color: colors.textSecondary },
    reasonRow: { backgroundColor: colors.background },
    reasonText: { color: colors.textPrimary },
    tipHighlight: { color: colors.textPrimary },
    tipBody: { color: colors.textSecondary },
  });

  return (
    <SafeArea>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <NotFoundTileIcon
              size={80}
              haloBackground={colors.notFoundTileHalo}
              cardBackground={colors.background}
              accentColor={colors.notFoundTileAccent}
            />
            <Text style={[styles.nothingDetected, stylesHook.nothingDetected]}>{loc.no_payment_found.nothing_detected}</Text>
            <Text style={[styles.heading, stylesHook.heading]}>{loc.no_payment_found.heading}</Text>
            <Text style={[styles.subheading, stylesHook.subheading]}>{loc.no_payment_found.subheading}</Text>
          </View>

          <View style={[styles.reasonsBox, stylesHook.reasonsBox]}>
            <Text style={[styles.reasonsTitle, stylesHook.reasonsTitle]}>{loc.no_payment_found.could_mean}</Text>
            {reasons.map(reason => (
              <View key={reason} style={[styles.reasonRow, stylesHook.reasonRow]}>
                <View style={[styles.bullet, { backgroundColor: colors.paymentBadgeFill }]} />
                <Text style={[styles.reasonText, stylesHook.reasonText]}>{reason}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.tipText}>
            {tipBefore}
            <Text style={[styles.tipHighlight, stylesHook.tipHighlight]}>{tipMatch}</Text>
            <Text style={stylesHook.tipBody}>{tipAfter}</Text>
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <ActionButton
            title={loc.no_payment_found.check_another_txid}
            onPress={handleCheckAnotherTxid}
            backgroundColor={colors.background}
            color={colors.textPrimary}
            borderColor={colors.copyButtonBorder}
            testID="CheckAnotherTxidButton"
          />
          <ActionButton
            title={loc.no_payment_found.copy_my_address}
            onPress={handleCopyAddress}
            Icon={CopyIcon}
            iconSize={20}
            backgroundColor={colors.brandPrimary}
            color={colors.white}
            testID="CopyMyAddressButton"
          />
        </View>
      </ScrollView>
    </SafeArea>
  );
};

export default NoPaymentFound;

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    justifyContent: 'space-between',
  },
  content: {
    alignItems: 'center',
    gap: 24,
  },
  hero: {
    alignItems: 'center',
    gap: 12,
  },
  nothingDetected: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  heading: {
    fontFamily: ClashFont.medium,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: ClashFont.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  reasonsBox: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  reasonsTitle: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  reasonText: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  tipText: {
    width: '100%',
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  tipHighlight: {
    fontFamily: ClashFont.medium,
  },
  buttonContainer: {
    paddingBottom: 30,
    paddingTop: 20,
    gap: 12,
  },
});
