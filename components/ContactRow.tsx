import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContactListItem, truncateContactAddress } from '../class/contacts';
import ContactAvatar from './ContactAvatar';
import ChevronRightIcon from './icons/ChevronRightIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface ContactRowProps {
  contact: ContactListItem;
  onPress: () => void;
  testID: string;
}

// Shared between the Contacts list and the send-flow contact picker sheet.
const ContactRow: React.FC<ContactRowProps> = ({ contact, onPress, testID }) => {
  const { colors } = useTheme();

  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={onPress} testID={testID}>
      <ContactAvatar name={contact.name} address={contact.address} />
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: colors.foregroundColor }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Text style={[styles.rowAddress, { color: colors.textSecondary }]} numberOfLines={1}>
          {truncateContactAddress(contact.address)}
        </Text>
      </View>
      <ChevronRightIcon color={colors.chevron} />
    </Pressable>
  );
};

export default ContactRow;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: ClashFont.medium, fontSize: 16 },
  rowAddress: { fontFamily: ClashFont.regular, fontSize: 13 },
});
