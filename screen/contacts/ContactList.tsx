import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { ContactListItem, searchContacts } from '../../class/contacts';
import ContactRow from '../../components/ContactRow';
import ContactsEmptyState from '../../components/ContactsEmptyState';
import SafeArea from '../../components/SafeArea';
import SearchField from '../../components/SearchField';
import { useTheme } from '../../components/themes';
import AddIcon from '../../components/icons/AddIcon';
import { useContacts } from '../../hooks/context/useContacts';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';

const ContactList: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const { contactList } = useContacts();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchContacts(contactList, query), [contactList, query]);

  const openAdd = useCallback(() => navigation.navigate('ContactEdit', { mode: 'add' }), [navigation]);

  const renderItem = useCallback(
    (p: { item: ContactListItem }) => (
      <ContactRow
        contact={p.item}
        onPress={() => navigation.navigate('ContactDetail', { address: p.item.address })}
        testID={`Contact-${p.item.address}`}
      />
    ),
    [navigation],
  );

  const HeaderRight = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={loc.contacts.add}
        onPress={openAdd}
        testID="AddContactButton"
        style={[styles.add, { backgroundColor: colors.brandPrimary, borderColor: colors.background }]}
      >
        <AddIcon size={24} color={colors.white} />
      </Pressable>
    ),
    [openAdd, colors.brandPrimary, colors.white, colors.background],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: contactList.length > 0 ? () => HeaderRight : undefined });
  }, [navigation, HeaderRight, contactList.length]);

  if (contactList.length === 0) {
    return (
      <SafeArea style={styles.root}>
        <ContactsEmptyState onAdd={openAdd} standalone />
      </SafeArea>
    );
  }

  return (
    <SafeArea style={styles.root}>
      <SearchField value={query} onChangeText={setQuery} placeholder={loc.contacts.search_placeholder} testID="ContactSearchInput" />
      <FlatList
        data={results}
        keyExtractor={item => item.address}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
      />
    </SafeArea>
  );
};

export default ContactList;

const styles = StyleSheet.create({
  root: { flex: 1 },
  add: { width: 40, height: 40, borderRadius: 8, borderWidth: 1.63, alignItems: 'center', justifyContent: 'center' },
  // Rows are bare here, so the 16pt rhythm is the list's to set.
  listContent: { gap: 16, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
});
