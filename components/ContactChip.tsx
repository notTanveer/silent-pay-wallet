import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { CONTACT_AVATAR_PALETTE, contactInitials } from '../class/contacts';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';
import { useTheme } from './themes';

interface ContactChipProps {
  name: string;
  colorIndex: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// names the payee of a payment being made or just made: "to Anmol Sharma", with the avatar the
// contact carries everywhere else. Unfilled, so it reads as part of whatever surface holds it.
const ContactChip: React.FC<ContactChipProps> = ({ name, colorIndex, style, testID }) => {
  const { colors } = useTheme();
  const tint = CONTACT_AVATAR_PALETTE[colorIndex];

  return (
    <View style={[styles.root, { borderColor: colors.contactChipBorder }, style]} testID={testID}>
      <View style={[styles.avatar, { borderColor: colors.contactChipBorder, backgroundColor: tint.background }]}>
        <Text style={[styles.initials, { color: tint.text }]}>{contactInitials(name)}</Text>
      </View>
      <Text style={[styles.name, { color: colors.contactChipText }]}>{loc.formatString(loc.contacts.to_name, { name })}</Text>
    </View>
  );
};

export default ContactChip;

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  avatar: {
    width: 32,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
  },
  initials: {
    fontFamily: ClashFont.semibold,
    fontSize: 12,
    lineHeight: 18,
  },
  name: {
    fontFamily: ClashFont.medium,
    fontSize: 12,
    lineHeight: 18,
  },
});
