import React, { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import BottomModal, { BottomModalHandle } from './BottomModal';
import ChevronRightIcon from './icons/ChevronRightIcon';
import ContactIcon from './icons/ContactIcon';
import ContactRow from './ContactRow';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';
import { useContacts } from '../hooks/context/useContacts';
import loc from '../loc';

interface ContactPickerSheetProps {
  onPick: (address: string) => void;
  onManage: () => void;
}

const ContactPickerSheet = forwardRef<BottomModalHandle, ContactPickerSheetProps>(({ onPick, onManage }, ref) => {
  const { colors } = useTheme();
  const { contactList } = useContacts();

  return (
    <BottomModal ref={ref} headerTitle={loc.contacts.pick_header} sizes={['auto']}>
      <View style={styles.root}>
        {contactList.map(item => (
          <ContactRow key={item.address} contact={item} onPress={() => onPick(item.address)} testID={`PickContact-${item.address}`} />
        ))}

        <Pressable
          accessibilityRole="button"
          style={[styles.row, styles.manage, { backgroundColor: colors.surfaceSubtle }]}
          onPress={onManage}
          testID="ManageContactsButton"
        >
          <ContactIcon color={colors.brandPrimary} size={20} />
          <Text style={[styles.rowName, styles.manageText, { color: colors.brandPrimary }]}>{loc.contacts.manage}</Text>
          <ChevronRightIcon color={colors.chevron} />
        </Pressable>
      </View>
    </BottomModal>
  );
});

export default ContactPickerSheet;

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowName: { fontFamily: ClashFont.medium, fontSize: 16 },
  manage: { borderRadius: 12, paddingHorizontal: 12, marginTop: 8 },
  manageText: { flex: 1 },
});
