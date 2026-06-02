import React from 'react';
import { StyleSheet, View } from 'react-native';

import QRCodeComponent from './QRCodeComponent';
import { useTheme } from './themes';

interface QRCardProps {
  value: string;
  size: number;
}

const logo = require('../img/logo.png');

const QRCard: React.FC<QRCardProps> = ({ value, size }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.qrCardBg }]}>
      <QRCodeComponent
        value={value}
        size={size}
        logo={logo}
        logoSize={size * 0.19}
        logoBackgroundColor={colors.white}
        logoBorderRadius={12}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    borderRadius: 16,
  },
});

export default QRCard;
