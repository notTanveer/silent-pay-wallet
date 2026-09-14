import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SettingsRowWrapper from './SettingsRowWrapper';
import ChevronRightIcon from './icons/ChevronRightIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsNavRowProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress: () => void;
  showSeparator?: boolean;
  testID?: string;
}

const SettingsNavRow: React.FC<SettingsNavRowProps> = ({ icon, title, subtitle, value, onPress, showSeparator = true, testID }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress}
        style={({ pressed }) => [styles.navRow, pressed && Platform.OS !== 'android' && styles.rowPressed]}
        android_ripple={{ color: colors.settingsRipple }}
        testID={testID}
      >
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <View style={styles.titleContainer}>
          <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.navRowValue}>
          {value ? <Text style={[styles.navRowValueText, { color: colors.alternativeTextColor }]}>{value}</Text> : null}
          <ChevronRightIcon />
        </View>
      </Pressable>
    </SettingsRowWrapper>
  );
};

export default SettingsNavRow;

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  rowPressed: {
    opacity: 0.7,
  },
  icon: {
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  navRowValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navRowValueText: {
    fontSize: 15,
    fontFamily: ClashFont.regular,
    marginRight: 4,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
    marginTop: 4,
  },
});
