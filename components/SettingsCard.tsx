import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from './themes';

interface SettingsCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, style }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { borderColor: colors.settingsCardBorder, backgroundColor: colors.settingsCardBackground }, style]}>
      {children}
    </View>
  );
};

export default SettingsCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
