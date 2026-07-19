import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './themes';
import CopyIcon from './icons/CopyIcon';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  copied?: boolean;
  accessibilityLabel?: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, mono, onCopy, copied, accessibilityLabel }) => {
  const { colors } = useTheme();
  const stylesHook = StyleSheet.create({
    label: { color: colors.textPrimary },
    value: { color: colors.textPrimary },
  });
  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <Text style={[styles.label, stylesHook.label]}>{label}</Text>
        {onCopy && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? loc.transactions.details_copy}
            hitSlop={10}
            onPress={onCopy}
            style={styles.copyBtn}
          >
            <CopyIcon size={16} color={copied ? colors.brandPrimary : colors.chevron} />
          </Pressable>
        )}
      </View>
      <Text style={[mono ? styles.valueMono : styles.value, stylesHook.value]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingVertical: 8,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 26,
  },
  value: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  valueMono: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 26,
  },
  copyBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DetailRow;
