import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { contactAvatarColorIndex, contactInitials } from '../class/contacts';
import { ClashFont } from '../constants/fonts';

// Fixed tints; deliberately independent of the light/dark theme so a contact keeps one
// recognisable colour. Final palette lands with the deferred UI pass.
const AVATAR_PALETTE: ReadonlyArray<{ background: string; text: string }> = [
  { background: '#EDE9FE', text: '#6D28D9' },
  { background: '#DBEAFE', text: '#1D4ED8' },
  { background: '#FEF3C7', text: '#B45309' },
  { background: '#DCFCE7', text: '#15803D' },
  { background: '#FCE7F3', text: '#BE185D' },
];

interface ContactAvatarProps {
  name: string;
  address: string;
  size?: number;
  borderRadius?: number;
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, address, size = 40, borderRadius }) => {
  const { background, text } = AVATAR_PALETTE[contactAvatarColorIndex(address, AVATAR_PALETTE.length)];

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: borderRadius ?? size / 4, backgroundColor: background }]}>
      <Text style={[styles.initials, { fontSize: size / 2.5, color: text }]}>{contactInitials(name)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: ClashFont.medium,
  },
});

export default ContactAvatar;
