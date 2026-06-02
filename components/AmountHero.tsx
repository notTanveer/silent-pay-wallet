import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ShroudText } from '../ShroudComponents';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';
import { isAmountEmpty } from '../helpers/send/format';
import { useTheme } from './themes';

interface AmountHeroProps {
  /** BTC amount as a string ('' when empty), or a display string in read-only mode. */
  amount?: string;
  /** Preformatted fiat estimate, e.g. "≈ ₹0". */
  fiat: string;
  editable?: boolean;
  onChangeAmount?: (text: string) => void;
  /** Shown beneath the fiat line in editable mode (e.g. "Tap amount to edit"). */
  showHint?: boolean;
  /** When provided (editable mode), renders the "Use Max" pill. */
  onUseMax?: () => void;
  useMaxDisabled?: boolean;
}

const AmountHero: React.FC<AmountHeroProps> = ({
  amount,
  fiat,
  editable = false,
  onChangeAmount,
  showHint = false,
  onUseMax,
  useMaxDisabled = false,
}) => {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const empty = isAmountEmpty(amount);

  const stylesHook = StyleSheet.create({
    amountFilled: { color: colors.black },
    amountEmpty: { color: 'rgba(0,0,0,0.32)' },
    meta: { color: colors.amountMeta },
    hint: { color: colors.brandPrimary },
    useMax: { backgroundColor: colors.surfaceSubtle, borderColor: colors.useMaxBorder },
    useMaxText: { color: colors.useMaxText },
  });

  const amountColor = empty ? stylesHook.amountEmpty : stylesHook.amountFilled;

  return (
    <Pressable
      style={styles.container}
      accessibilityRole={editable ? 'button' : undefined}
      onPress={editable ? () => inputRef.current?.focus() : undefined}
    >
      <View style={styles.amountRow}>
        {editable ? (
          <TextInput
            ref={inputRef}
            style={[styles.amount, amountColor]}
            value={amount}
            onChangeText={onChangeAmount}
            placeholder="0"
            placeholderTextColor="rgba(0,0,0,0.32)"
            keyboardType="decimal-pad"
            testID="AmountHeroInput"
          />
        ) : (
          <ShroudText style={[styles.amount, amountColor]} testID="AmountHeroValue">
            {empty ? '0' : amount}
          </ShroudText>
        )}
        <ShroudText style={[styles.unit, stylesHook.meta]}>BTC</ShroudText>
      </View>

      <ShroudText style={[styles.fiat, stylesHook.meta]}>{fiat}</ShroudText>

      {showHint && <ShroudText style={[styles.hint, stylesHook.hint]}>{loc.send.tap_amount_to_edit}</ShroudText>}

      {onUseMax && (
        <Pressable
          accessibilityRole="button"
          disabled={useMaxDisabled}
          onPress={onUseMax}
          style={[styles.useMax, stylesHook.useMax, useMaxDisabled && styles.useMaxDisabled]}
          testID="UseMaxButton"
        >
          <ShroudText style={[styles.useMaxText, stylesHook.useMaxText]}>{loc.send.use_max}</ShroudText>
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    gap: 3,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  amount: {
    fontFamily: ClashFont.medium,
    fontSize: 48,
    lineHeight: 48,
    letterSpacing: -1.2,
    textAlign: 'center',
    minWidth: 40,
    padding: 0,
  },
  unit: {
    fontFamily: ClashFont.regular,
    fontSize: 20,
    lineHeight: 30,
    marginBottom: 8,
  },
  fiat: {
    fontFamily: ClashFont.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  hint: {
    fontFamily: ClashFont.regular,
    fontSize: 12,
    lineHeight: 22,
    textAlign: 'center',
  },
  useMax: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 23,
    paddingVertical: 4,
  },
  useMaxDisabled: {
    opacity: 0.5,
  },
  useMaxText: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 24,
  },
});

export default AmountHero;
