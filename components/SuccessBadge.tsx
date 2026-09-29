import React from 'react';
import { StyleSheet, View } from 'react-native';

import CheckmarkIcon from './icons/CheckmarkIcon';
import { useTheme } from './themes';

// The brand check in a tinted circle that heads every success screen and sheet.
const SuccessBadge: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.circle, { backgroundColor: colors.surfaceSubtle }]}>
      <CheckmarkIcon size={32} color={colors.brandPrimary} />
    </View>
  );
};

export default SuccessBadge;

const styles = StyleSheet.create({
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
