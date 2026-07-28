import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SettingsIconWrapper from './icons/SettingsIconWrapper';
import ChevronRightIcon from './icons/ChevronRightIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface RowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  isLoading?: boolean;
  testID?: string;
  showSeparator?: boolean;
  roundIcon?: boolean;
  rightElement?: React.ReactNode;
}

const Row: React.FC<RowProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  selected,
  isLoading,
  testID,
  showSeparator = true,
  roundIcon = false,
  rightElement = <ChevronRightIcon />,
}) => {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        styles.row,
        showSeparator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.settingsCardBorder },
        pressed && Platform.OS !== 'android' && styles.rowPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      android_ripple={{ color: colors.settingsRipple }}
    >
      <SettingsIconWrapper circle={roundIcon}>{icon}</SettingsIconWrapper>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}>{subtitle}</Text> : null}
      </View>
      {isLoading ? <ActivityIndicator color={colors.settingsRowTitle} /> : rightElement}
    </Pressable>
  );
};

export default Row;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
    marginTop: 8,
  },
});
