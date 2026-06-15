import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ChevronRightIcon from './icons/ChevronRightIcon';
import loc from '../loc';

interface HeaderBackButtonProps {
  onPress: () => void;
  color: string;
}

const HeaderBackButton: React.FC<HeaderBackButtonProps> = ({ onPress, color }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={loc._.back}
    style={styles.button}
    onPress={onPress}
    testID="NavigationBackButton"
  >
    <View style={styles.flip}>
      <ChevronRightIcon color={color} size={20} />
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    minWidth: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flip: {
    transform: [{ rotate: '180deg' }],
  },
});

export default HeaderBackButton;
