import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SettingsRowWrapper from './SettingsRowWrapper';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsStatRowProps {
  title: string;
  value: string;
  valueColor?: string;
  showSeparator?: boolean;
}

const SettingsStatRow: React.FC<SettingsStatRowProps> = ({ title, value, valueColor, showSeparator = true }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.value, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      </View>
    </SettingsRowWrapper>
  );
};

export default SettingsStatRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  // Matches SettingsNavRow's title so the two can share a card.
  label: {
    fontSize: 14,
    fontFamily: ClashFont.medium,
  },
  value: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
  },
});
