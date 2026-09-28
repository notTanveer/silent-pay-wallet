import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { ClashFont } from '../constants/fonts';
import { IconProps } from './icons/types';
import { useTheme } from './themes';

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  /** Drawn to the left of the title, in the title's colour. */
  Icon?: React.FC<IconProps>;
  iconSize?: number;
  backgroundColor: string;
  /** Applied to both the title and the icon, so the two never drift apart. */
  color: string;
  /** Outlined variant, e.g. the destructive "Remove contact" button. */
  borderColor?: string;
  /** Swaps in the shared disabled colours, so every disabled CTA looks the same. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// The app's full-width call to action: a 56pt pill with an optional leading glyph. Enabled colours
// stay the caller's to pick, so one button covers the brand, tinted and destructive variants without
// growing a taxonomy of them.
const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  onPress,
  Icon,
  iconSize = 24,
  backgroundColor,
  color,
  borderColor,
  disabled,
  style,
  testID,
}) => {
  const { colors } = useTheme();
  const fill = disabled ? colors.accentSubtle : backgroundColor;
  const tint = disabled ? colors.textMuted : color;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        actionButtonStyles.button,
        borderColor !== undefined && actionButtonStyles.outlined,
        { backgroundColor: fill, borderColor },
        style,
      ]}
    >
      {Icon !== undefined && <Icon size={iconSize} color={tint} />}
      <Text style={[actionButtonStyles.title, { color: tint }]}>{title}</Text>
    </Pressable>
  );
};

export default ActionButton;

// Exported so pill-shaped controls that can't be an ActionButton (e.g. a menu trigger) keep its geometry.
export const actionButtonStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  outlined: { borderWidth: 1 },
  title: { fontFamily: ClashFont.medium, fontSize: 16, lineHeight: 24, textAlign: 'center' },
});
