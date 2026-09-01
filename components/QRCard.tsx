import React from 'react';
import { ImageSourcePropType, StyleSheet, View } from 'react-native';

import QRCodeComponent from './QRCodeComponent';
import { useTheme } from './themes';

interface QRCardProps {
  value: string;
  size: number;
  logo?: ImageSourcePropType;
  isMenuAvailable?: boolean;
  ecl?: 'H' | 'Q' | 'M' | 'L';
  onError?: () => void;
}

const QRCard: React.FC<QRCardProps> = ({ value, size, logo, isMenuAvailable, ecl, onError }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSubtle }]}>
      <QRCodeComponent
        value={value}
        size={size}
        isMenuAvailable={isMenuAvailable}
        ecl={ecl}
        onError={onError}
        {...(logo ? { logo, logoSize: size * 0.19, logoBackgroundColor: colors.white, logoBorderRadius: 12 } : {})}
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
