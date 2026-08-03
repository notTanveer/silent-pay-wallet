import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface HomeActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  testID: string;
  onLongPress?: () => void;
  accessibilityHint?: string;
  // Overrides the default chip fill; Pay uses it for its active and zero-balance states.
  chipStyle?: StyleProp<ViewStyle>;
}

// One entry in the home screen's Contacts / Request / Pay / Scan row: a tinted icon chip above a label.
const HomeActionButton: React.FC<HomeActionButtonProps> = ({ icon, label, onPress, testID, onLongPress, accessibilityHint, chipStyle }) => {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
    >
      <View style={[styles.chip, { backgroundColor: colors.actionChipBackground }, chipStyle]}>{icon}</View>
      <Text style={[styles.label, { color: colors.foregroundColor }]}>{label}</Text>
    </TouchableOpacity>
  );
};

export default HomeActionButton;

const styles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  chip: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
    letterSpacing: -0.15,
  },
});
