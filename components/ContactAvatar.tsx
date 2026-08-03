import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CONTACT_AVATAR_PALETTE, contactInitials } from '../class/contacts';
import { ClashFont } from '../constants/fonts';

interface ContactAvatarProps {
  name: string;
  colorIndex: number;
  size?: number;
  borderRadius?: number;
}

const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, colorIndex, size = 40, borderRadius }) => {
  const { background, text } = CONTACT_AVATAR_PALETTE[colorIndex];

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: borderRadius ?? size / 4, backgroundColor: background }]}>
      <Text style={[styles.initials, { fontSize: size / 3, color: text }]}>{contactInitials(name)}</Text>
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
