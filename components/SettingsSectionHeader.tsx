import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsSectionHeaderProps {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
}

const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({ children, color, style }) => {
  const { colors } = useTheme();
  return <Text style={[styles.header, { color: color ?? colors.alternativeTextColor }, style]}>{children}</Text>;
};

export default SettingsSectionHeader;

const styles = StyleSheet.create({
  header: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginBottom: 8,
    marginLeft: 4,
  },
});
