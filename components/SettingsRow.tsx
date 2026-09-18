import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SettingsIconWrapper from './icons/SettingsIconWrapper';
import ChevronRightIcon from './icons/ChevronRightIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  isLoading?: boolean;
  testID?: string;
  showSeparator?: boolean;
  circle?: boolean;
  rightElement?: React.ReactNode;
}

const DEFAULT_CHEVRON = <ChevronRightIcon />;

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  selected,
  isLoading,
  testID,
  showSeparator = true,
  circle = false,
  rightElement = DEFAULT_CHEVRON,
}) => {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        styles.row,
        showSeparator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderDefault },
        pressed && Platform.OS !== 'android' && styles.rowPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      android_ripple={{ color: colors.borderDefault }}
    >
      <SettingsIconWrapper circle={circle}>{icon}</SettingsIconWrapper>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {isLoading ? <ActivityIndicator color={colors.textSecondary} /> : rightElement}
    </Pressable>
  );
};

export default React.memo(SettingsRow);

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
