import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import BigNumber from 'bignumber.js';
import LottieView from 'lottie-react-native';
import { Text as RNEText } from '@rneui/themed';
import { ShroudCard } from '../../ShroudComponents';
import AmountHero from '../../components/AmountHero';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import { ClashFont } from '../../constants/fonts';
import { useTheme } from '../../components/themes';
import loc from '../../loc';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import { SendDetailsStackParamList } from '../../navigation/SendDetailsStackParamList.ts';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation.ts';
import { btcToSatoshi, satoshiToLocalCurrency } from '../../modules/currency';

type RouteProps = RouteProp<SendDetailsStackParamList, 'Success'>;

const Success = () => {
  const navigation = useExtendedNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProps>();
  const { amount } = route.params || {};

  const amountStr = amount != null ? String(amount) : '0';
  const amountSats = amount != null ? btcToSatoshi(amount) : 0;
  const fiat = `≈ ${satoshiToLocalCurrency(amountSats)}`;

  const onDonePressed = () => {
    // @ts-ignore getParent() typing doesn't expose pop()
    navigation?.getParent()?.pop();
  };

  const stylesHook = StyleSheet.create({
    overlay: { backgroundColor: colors.scrim },
    sheet: { backgroundColor: colors.background, paddingBottom: 32 + insets.bottom },
    checkCircle: { backgroundColor: colors.surfaceSubtle },
    sentText: { color: colors.black },
    doneButton: { backgroundColor: colors.brandPrimary },
    doneButtonText: { color: colors.white },
  });

  return (
    <View style={[styles.overlay, stylesHook.overlay]}>
      <View style={[styles.sheet, stylesHook.sheet]}>
        <View style={[styles.checkCircle, stylesHook.checkCircle]}>
          <CheckmarkIcon size={32} color={colors.brandPrimary} />
        </View>

        <Text style={[styles.sentText, stylesHook.sentText]}>{loc.send.sent_successfully}</Text>

        <AmountHero amount={amountStr} fiat={fiat} />

        <Pressable
          accessibilityRole="button"
          testID="successDoneButton"
          onPress={onDonePressed}
          style={[styles.doneButton, stylesHook.doneButton]}
        >
          <Text style={[styles.doneButtonText, stylesHook.doneButtonText]}>{loc.send.success_done}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default Success;

interface SuccessViewParam {
  amount?: number;
  amountUnit?: BitcoinUnit;
  fee?: number;
  shouldAnimate?: boolean;
}

export const SuccessView = ({ amount, amountUnit, fee, shouldAnimate = true }: SuccessViewParam) => {
  const { colors } = useTheme();

  let unit: string = '';
  switch (amountUnit) {
    case BitcoinUnit.BTC:
    case BitcoinUnit.SATS:
      unit = loc.units[amountUnit];
      break;
  }

  const stylesHook = StyleSheet.create({
    amountValue: {
      color: colors.alternativeTextColor2,
    },
    amountUnit: {
      color: colors.alternativeTextColor2,
    },
  });

  return (
    <View style={successViewStyles.root}>
      {amount || (fee ?? 0) > 0 ? (
        <ShroudCard style={successViewStyles.amount}>
          <View style={successViewStyles.view}>
            {amount ? (
              <>
                <RNEText style={[successViewStyles.amountValue, stylesHook.amountValue]}>{amount}</RNEText>
                <RNEText style={[successViewStyles.amountUnit, stylesHook.amountUnit]}>{' ' + unit}</RNEText>
              </>
            ) : null}
          </View>
          {(fee ?? 0) > 0 && (
            <RNEText style={successViewStyles.feeText}>
              {loc.send.create_fee}: {new BigNumber(fee ?? 0).toFixed(8)} {loc.units[BitcoinUnit.BTC]}
            </RNEText>
          )}
        </ShroudCard>
      ) : null}

      <View style={successViewStyles.ready}>
        <LottieView
          style={successViewStyles.lottie}
          source={require('../../img/bluenice.json')}
          autoPlay={shouldAnimate}
          loop={false}
          progress={shouldAnimate ? 0 : 1}
          colorFilters={[
            {
              keypath: 'spark',
              color: colors.success,
            },
            {
              keypath: 'circle',
              color: colors.success,
            },
            {
              keypath: 'Oval',
              color: colors.successCheck,
            },
          ]}
          resizeMode="center"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 32,
    paddingHorizontal: 24,
    gap: 20,
    alignItems: 'center',
  },
  checkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentText: {
    fontFamily: ClashFont.medium,
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
  },
  doneButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  doneButtonText: {
    fontFamily: ClashFont.medium,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});

const successViewStyles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 19,
  },
  amount: {
    alignItems: 'center',
  },
  view: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  amountValue: {
    fontSize: 36,
    fontWeight: '600',
  },
  amountUnit: {
    fontSize: 16,
    marginHorizontal: 4,
    paddingBottom: 6,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  feeText: {
    color: '#37c0a1',
    fontSize: 14,
    marginHorizontal: 4,
    paddingVertical: 6,
    fontWeight: '500',
    alignSelf: 'center',
  },
  ready: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 53,
  },
  lottie: {
    width: 200,
    height: 200,
  },
});
