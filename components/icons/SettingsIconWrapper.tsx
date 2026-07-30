import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../themes';

interface SettingsIconWrapperProps {
  children: React.ReactNode;
}

const SettingsIconWrapper: React.FC<SettingsIconWrapperProps> = ({ children }) => {
  const { colors } = useTheme();
  return <View style={[styles.container, { backgroundColor: colors.settingsIconWrapperBg }]}>{children}</View>;
};

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SettingsIconWrapper;
