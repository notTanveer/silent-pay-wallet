import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { ShroudText } from '../ShroudComponents';
import { ClashFont } from '../constants/fonts';
import { splitForEmphasis } from '../helpers/emphasis';
import InfoIcon from './icons/InfoIcon';
import InfoBadgeIcon from './icons/InfoBadgeIcon';
import { useTheme } from './themes';

interface InfoBannerProps {
  text: string;
  emphasis?: string;
  /** Optional heading shown above `text`. */
  title?: string;
  variant?: 'info' | 'caution';
  /** 1px border in the variant's accent color. */
  bordered?: boolean;
  /** Icon inside a filled accent circle instead of bare. */
  badge?: boolean;
  containerStyle?: ViewStyle;
}

const InfoBanner: React.FC<InfoBannerProps> = ({
  text,
  emphasis,
  title,
  variant = 'info',
  bordered = false,
  badge = false,
  containerStyle,
}) => {
  const { colors } = useTheme();
  const [before, match, after] = splitForEmphasis(text, emphasis);
  const backgroundColor = variant === 'caution' ? colors.surfaceCaution : colors.surfaceSubtle;
  const iconColor = variant === 'caution' ? colors.iconCaution : colors.primary;
  const borderColor = variant === 'caution' ? colors.iconCaution : colors.accentSubtle;

  return (
    <View style={[styles.banner, { backgroundColor }, bordered && styles.bordered, bordered && { borderColor }, containerStyle]}>
      <View style={styles.icon}>
        {badge ? (
          <InfoBadgeIcon size={28} backgroundColor={colors.accentSubtle} color={colors.brandPrimary} />
        ) : (
          <InfoIcon size={20} color={iconColor} />
        )}
      </View>
      <View style={styles.textColumn}>
        {title ? <ShroudText style={[styles.title, { color: colors.textPrimary }]}>{title}</ShroudText> : null}
        <ShroudText style={[styles.text, { color: colors.textSecondary }]}>
          {before}
          {match ? <ShroudText style={[styles.emphasis, { color: colors.textPrimary }]}>{match}</ShroudText> : null}
          {after}
        </ShroudText>
      </View>
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
  bordered: {
    borderWidth: 1,
  },
  textColumn: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontFamily: ClashFont.medium,
    fontSize: 14,
  },
  text: {
    fontFamily: ClashFont.regular,
    fontSize: 14,
    lineHeight: 23,
  },
  emphasis: {
    fontFamily: ClashFont.medium,
  },
});

export default InfoBanner;
