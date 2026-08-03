import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContactListItem, truncateContactAddress } from '../class/contacts';
import ContactAvatar from './ContactAvatar';
import ChevronRightIcon from './icons/ChevronRightIcon';
import PaperPlaneIcon from './icons/PaperPlaneIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';

type ContactRowProps = {
  contact: ContactListItem;
  onPress: () => void;
  testID: string;
} & (
  | // Bare row that opens the contact, for a screen whose whole job is the list.
  { variant?: 'row' }
  // Bordered card carrying its own pay action, for a list sharing a screen with other content.
  | { variant: 'card'; onPay: () => void }
);

const ContactRow: React.FC<ContactRowProps> = props => {
  const { contact, onPress, testID } = props;
  const { colors } = useTheme();
  const isCard = props.variant === 'card';

  const identity = (
    <>
      <ContactAvatar name={contact.name} colorIndex={contact.colorIndex} size={48} borderRadius={16} />
      <View style={[styles.text, isCard ? styles.cardText : styles.rowText]}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text style={[styles.rowAddress, { color: colors.textSecondary }]} numberOfLines={1}>
          {truncateContactAddress(contact.address)}
        </Text>
      </View>
    </>
  );

  if (props.variant !== 'card') {
    return (
      <Pressable accessibilityRole="button" style={styles.row} onPress={onPress} testID={testID}>
        {identity}
        <ChevronRightIcon color={colors.chevron} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.transactionCardBorder }]}
      onPress={onPress}
      testID={testID}
    >
      {identity}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${loc.contacts.pay} ${contact.name}`}
        style={[styles.pay, { backgroundColor: colors.surfaceSubtle, borderColor: colors.borderDefault }]}
        onPress={props.onPay}
        testID={`${testID}-Pay`}
      >
        <PaperPlaneIcon size={16} color={colors.textBrand} />
        <Text style={[styles.payText, { color: colors.textBrand }]}>{loc.contacts.pay}</Text>
      </Pressable>
    </Pressable>
  );
};

export default ContactRow;

const styles = StyleSheet.create({
  // A bare row's vertical rhythm comes from the list's gap, not from padding of its own.
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 77,
    borderRadius: 16,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  text: { flex: 1 },
  rowText: { gap: 12 },
  cardText: { gap: 4 },
  rowName: { fontFamily: ClashFont.medium, fontSize: 16, lineHeight: 20 },
  rowAddress: { fontFamily: ClashFont.regular, fontSize: 14, lineHeight: 17 },
  pay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  payText: { fontFamily: ClashFont.medium, fontSize: 16, lineHeight: 24 },
});
