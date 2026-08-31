import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SettingsRowWrapper from './SettingsRowWrapper';
import Toggle from './Toggle';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  showSeparator?: boolean;
  testID?: string;
}

const SettingsToggleRow: React.FC<SettingsToggleRowProps> = ({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  showSeparator = true,
  testID,
}) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{title}</Text>
          <Toggle value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={title} testID={testID} />
        </View>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}>{subtitle}</Text> : null}
      </View>
    </SettingsRowWrapper>
  );
};

export default SettingsToggleRow;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: {
    flexShrink: 1,
    marginRight: 12,
    fontSize: 14,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginTop: 6,
    lineHeight: 18,
  },
});
