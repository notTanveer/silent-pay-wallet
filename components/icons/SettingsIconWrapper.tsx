import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../themes';

interface SettingsIconWrapperProps {
  children: React.ReactNode;
  circle?: boolean;
}

const SettingsIconWrapper: React.FC<SettingsIconWrapperProps> = ({ children, circle = false }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, circle ? styles.circle : styles.square, { backgroundColor: colors.settingsIconWrapperBg }]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    borderRadius: 24,
  },
  square: {
    borderRadius: 14,
  },
});

export default SettingsIconWrapper;
