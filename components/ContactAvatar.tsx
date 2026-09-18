import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { ClashFont } from '../constants/fonts';
import { palette as themePalette, useTheme } from './themes';

export const CONTACT_AVATAR_PALETTE: ReadonlyArray<{ background: string; text: string }> = [
  { background: themePalette.purple200, text: themePalette.purple500 },
  { background: themePalette.avatarBlue, text: themePalette.avatarBlueText },
  { background: themePalette.amber100, text: themePalette.amber500 },
  { background: themePalette.green100, text: themePalette.green500 },
  { background: themePalette.avatarPink, text: themePalette.avatarPinkText },
];

export const CONTACT_AVATAR_DARK_PALETTE: ReadonlyArray<{ background: string; text: string }> = [
  { background: themePalette.purple700, text: themePalette.purple600 },
  { background: themePalette.neutral750, text: themePalette.avatarBlueText },
  { background: themePalette.amber800, text: themePalette.amber400 },
  { background: themePalette.green800, text: themePalette.green400 },
  { background: themePalette.red100, text: themePalette.avatarPinkText },
];

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
  const { dark } = useTheme();
  const palette = dark ? CONTACT_AVATAR_DARK_PALETTE : CONTACT_AVATAR_PALETTE;
  // A colorIndex out of range only reaches here from a hand-edited bucket; fall back rather than
  // destructure undefined.
  const { background, text } = palette[colorIndex] ?? palette[0];

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
