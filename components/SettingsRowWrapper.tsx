import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from './themes';

interface SettingsRowWrapperProps {
  children: React.ReactNode;
  showSeparator?: boolean;
  separatorStyle?: StyleProp<ViewStyle>;
}

const SettingsRowWrapper: React.FC<SettingsRowWrapperProps> = ({ children, showSeparator = true, separatorStyle }) => {
  const { colors } = useTheme();
  return (
    <View>
      {children}
      {showSeparator && <View style={[styles.separator, { backgroundColor: colors.settingsCardBorder }, separatorStyle]} />}
    </View>
  );
};

export default SettingsRowWrapper;

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
