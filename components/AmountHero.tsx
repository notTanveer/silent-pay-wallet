import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ShroudText } from '../ShroudComponents';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';
import { BitcoinUnit } from '../models/bitcoinUnits';
import { isAmountEmpty } from '../helpers/send/format';
import CheckmarkIcon from './icons/CheckmarkIcon';
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
  /** When provided (editable mode), renders the "Max" pill. */
  onUseMax?: () => void;
  useMaxDisabled?: boolean;
  /** When true, the Max pill shows a tick and the "Sending Max" hint replaces the edit hint. */
  isMax?: boolean;
  /** Unit shown next to the amount. Defaults to BTC. */
  unit?: BitcoinUnit;
  /** When provided, the unit label becomes a button that toggles BTC <-> sats. */
  onToggleUnit?: () => void;
  /** Extra space below the unit label, pulling it up off the amount's baseline. Defaults to 0 (flush baseline, matches Confirm). Send's editable layout wants 8. */
  unitMarginBottom?: number;
}

const AmountHero: React.FC<AmountHeroProps> = ({
  amount,
  fiat,
  editable = false,
  onChangeAmount,
  showHint = false,
  onUseMax,
  useMaxDisabled = false,
  isMax = false,
  unit = BitcoinUnit.BTC,
  onToggleUnit,
  unitMarginBottom = 0,
}) => {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const empty = isAmountEmpty(amount);

  const stylesHook = StyleSheet.create({
    amountFilled: { color: colors.black },
    amountEmpty: { color: colors.amountPlaceholder },
    meta: { color: colors.amountMeta },
    hint: { color: colors.brandPrimary },
    sendingMax: { color: colors.brandPrimary },
    useMax: { backgroundColor: colors.surfaceSubtle, borderColor: colors.useMaxBorder },
    useMaxText: { color: colors.useMaxText },
    unit: { marginBottom: unitMarginBottom },
  });

  const amountColor = empty ? stylesHook.amountEmpty : stylesHook.amountFilled;
  const unitLabel = unit === BitcoinUnit.SATS ? loc.units[BitcoinUnit.SATS] : loc.units[BitcoinUnit.BTC];
  const keyboardType = unit === BitcoinUnit.SATS ? 'number-pad' : 'decimal-pad';

  return (
    <Pressable
      style={styles.container}
      accessibilityRole={editable && !isMax ? 'button' : undefined}
      onPress={editable && !isMax ? () => inputRef.current?.focus() : undefined}
    >
      <View style={styles.amountRow}>
        {editable ? (
          <TextInput
            ref={inputRef}
            style={[styles.amount, amountColor]}
            value={amount}
            onChangeText={onChangeAmount}
            placeholder="0"
            placeholderTextColor={colors.amountPlaceholder}
            keyboardType={keyboardType}
            editable={!isMax}
            testID="AmountHeroInput"
          />
        ) : (
          <ShroudText style={[styles.amount, amountColor]} testID="AmountHeroValue">
            {empty ? '0' : amount}
          </ShroudText>
        )}
        {onToggleUnit ? (
          <Pressable accessibilityRole="button" onPress={onToggleUnit} hitSlop={8} testID="AmountUnitToggle">
            <ShroudText style={[styles.unit, stylesHook.meta, stylesHook.unit]}>{unitLabel}</ShroudText>
          </Pressable>
        ) : (
          <ShroudText style={[styles.unit, stylesHook.meta, stylesHook.unit]}>{unitLabel}</ShroudText>
        )}
      </View>

      <ShroudText style={[styles.fiat, stylesHook.meta]}>{fiat}</ShroudText>

      {isMax ? (
        <ShroudText style={[styles.hint, stylesHook.sendingMax]}>{loc.send.sending_max}</ShroudText>
      ) : (
        showHint && <ShroudText style={[styles.hint, stylesHook.hint]}>{loc.send.tap_amount_to_edit}</ShroudText>
      )}

      {onUseMax && (
        <Pressable
          accessibilityRole="button"
          disabled={useMaxDisabled}
          onPress={onUseMax}
          style={[styles.useMax, stylesHook.useMax, useMaxDisabled && styles.useMaxDisabled]}
          testID="UseMaxButton"
        >
          {isMax && <CheckmarkIcon color={colors.brandPrimary} size={16} />}
          <ShroudText style={[styles.useMaxText, stylesHook.useMaxText]}>{isMax ? loc.send.max_active : loc.send.max}</ShroudText>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
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
