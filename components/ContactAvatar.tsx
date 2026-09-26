import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { ClashFont } from '../constants/fonts';
import { Theme, useTheme } from './themes';

type ColorKey = keyof Theme['colors'];

// One [fill, initials] token pair per stored colorIndex (CONTACT_COLOR_COUNT in class/contacts).
export const AVATAR_COLORS = [
  ['avatarPurple', 'avatarPurpleText'],
  ['avatarBlue', 'avatarBlueText'],
  ['avatarAmber', 'avatarAmberText'],
  ['avatarGreen', 'avatarGreenText'],
  ['avatarPink', 'avatarPinkText'],
] as const satisfies ReadonlyArray<readonly [ColorKey, ColorKey]>;

export const contactInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');

interface ContactAvatarProps {
  name: string;
  colorIndex: number;
  size?: number;
  borderRadius?: number;
  /** Shape overrides for hosts that are not a square tile, e.g. ContactChip's 32x22 pill. */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, colorIndex, size = 40, borderRadius, style, textStyle }) => {
  const { colors } = useTheme();
  // A colorIndex out of range only reaches here from a hand-edited bucket; fall back rather than
  // destructure undefined.
  const [fillKey, textKey] = AVATAR_COLORS[colorIndex] ?? AVATAR_COLORS[0];
  const background = colors[fillKey];
  const text = colors[textKey];

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: borderRadius ?? size / 4, backgroundColor: background }, style]}>
      <Text style={[styles.initials, { fontSize: size / 3, color: text }, textStyle]}>{contactInitials(name)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: ClashFont.semibold,
  },
});

export default ContactAvatar;
