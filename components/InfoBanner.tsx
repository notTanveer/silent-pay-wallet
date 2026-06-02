import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { ShroudText } from '../ShroudComponents';
import { ClashFont } from '../constants/fonts';
import { splitForEmphasis } from '../helpers/emphasis';
import InfoIcon from './icons/InfoIcon';
import { useTheme } from './themes';

interface InfoBannerProps {
  text: string;
  emphasis?: string;
  containerStyle?: ViewStyle;
}

const InfoBanner: React.FC<InfoBannerProps> = ({ text, emphasis, containerStyle }) => {
  const { colors } = useTheme();
  const [before, match, after] = splitForEmphasis(text, emphasis);

  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceSubtle }, containerStyle]}>
      <View style={styles.icon}>
        <InfoIcon size={20} color={colors.brandPrimary} />
      </View>
      <ShroudText style={[styles.text, { color: colors.textSecondary }]}>
        {before}
        {match ? <ShroudText style={[styles.bold, { color: colors.textPrimary }]}>{match}</ShroudText> : null}
        {after}
      </ShroudText>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    paddingVertical: 19,
    paddingHorizontal: 17,
    gap: 10,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 23,
  },
  bold: {
    fontFamily: ClashFont.semibold,
  },
});

export default InfoBanner;
