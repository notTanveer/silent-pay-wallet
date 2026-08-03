import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AddIcon from './icons/AddIcon';
import ContactsGroupIcon from './icons/ContactsGroupIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';

interface ContactsEmptyStateProps {
  onAdd: () => void;
}

// Shown in place of the search field and list until the first contact is saved.
const ContactsEmptyState: React.FC<ContactsEmptyStateProps> = ({ onAdd }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <ContactsGroupIcon size={94} background={colors.shieldIconBackground} borderColor={colors.shieldIconBorder} accent={colors.primary} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.contactsEmptyTitle }]}>{loc.contacts.empty_title}</Text>
        <Text style={[styles.subtitle, { color: colors.amountMeta }]}>{loc.contacts.empty_subtitle}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        testID="ContactsEmptyAddButton"
        style={[styles.cta, { backgroundColor: colors.primary }]}
      >
        <AddIcon size={24} color={colors.white} />
        <Text style={[styles.ctaText, { color: colors.white }]}>{loc.contacts.empty_cta}</Text>
      </Pressable>
    </View>
  );
};

export default ContactsEmptyState;

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28, paddingHorizontal: 24 },
  textBlock: { alignItems: 'center', gap: 12 },
  title: { fontFamily: ClashFont.medium, fontSize: 20, lineHeight: 32, letterSpacing: 0.0703125, textAlign: 'center' },
  subtitle: {
    fontFamily: ClashFont.regular,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.3125,
    textAlign: 'center',
    width: 268,
  },
  cta: {
    width: 214,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  ctaText: { fontFamily: ClashFont.medium, fontSize: 16, lineHeight: 24, textAlign: 'center' },
});
