import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import BottomModal, { BottomModalHandle } from './BottomModal';
import ContactRow from './ContactRow';
import HeaderBackButton from './HeaderBackButton';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';
import { useContacts } from '../hooks/context/useContacts';
import loc from '../loc';

// Five 49pt rows plus their 16pt gutters — the window the sheet opens at before the list scrolls.
const LIST_MAX_HEIGHT = 5 * 49 + 4 * 16;

interface ContactPickerSheetProps {
  onPick: (address: string) => void;
}

const ContactPickerSheet = forwardRef<BottomModalHandle, ContactPickerSheetProps>(({ onPick }, ref) => {
  const { colors } = useTheme();
  const { contactList } = useContacts();
  const sheetRef = useRef<BottomModalHandle>(null);
  const scrollRef = useRef<ScrollView>(null);

  useImperativeHandle(ref, () => ({
    present: async () => sheetRef.current?.present(),
    dismiss: async () => sheetRef.current?.dismiss(),
  }));

  return (
    <BottomModal
      ref={sheetRef}
      sizes={['auto']}
      // Rounds the top corners only; the native sheet squares off the bottom two.
      cornerRadius={16}
      backgroundColor={colors.modal}
      // The back chevron is the dismiss affordance here, so the grabber would only crowd it.
      isGrabberVisible={false}
      showCloseButton={false}
      contentStyle={styles.sheet}
      scrollRef={scrollRef as React.RefObject<React.Component<unknown>>}
    >
      <View style={styles.header}>
        <HeaderBackButton onPress={() => sheetRef.current?.dismiss()} color={colors.sheetBackIcon} testID="PickContactBackButton" />
        <Text style={[styles.title, { color: colors.textPrimary }]}>{loc.contacts.pick_header}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {contactList.map(item => (
          <ContactRow key={item.address} contact={item} onPress={() => onPick(item.address)} testID={`PickContact-${item.address}`} />
        ))}
      </ScrollView>
    </BottomModal>
  );
});

export default ContactPickerSheet;

const styles = StyleSheet.create({
  sheet: { paddingTop: 0, paddingHorizontal: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  // Flanked by the 40pt back button and an equal spacer, so the title sits dead centre.
  title: { flex: 1, textAlign: 'center', fontFamily: ClashFont.medium, fontSize: 17, lineHeight: 26 },
  headerSpacer: { width: 40 },
  list: { maxHeight: LIST_MAX_HEIGHT, marginTop: 16 },
  listContent: { gap: 16, paddingHorizontal: 24, paddingBottom: 24 },
});
