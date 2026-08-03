import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput } from 'react-native';

import { searchContacts } from '../../class/contacts';
import ContactRow from '../../components/ContactRow';
import ContactsEmptyState from '../../components/ContactsEmptyState';
import SafeArea from '../../components/SafeArea';
import { useTheme } from '../../components/themes';
import { useContacts } from '../../hooks/context/useContacts';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';

const ContactList: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const { contactList } = useContacts();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchContacts(contactList, query), [contactList, query]);

  const openAdd = () => navigation.navigate('ContactEdit', { mode: 'add' });

  if (contactList.length === 0) {
    return (
      <SafeArea style={styles.root}>
        <ContactsEmptyState onAdd={openAdd} />
      </SafeArea>
    );
  }

  return (
    <SafeArea style={styles.root}>
      <TextInput
        style={[styles.search, { backgroundColor: colors.fieldBackground, color: colors.foregroundColor }]}
        placeholder={loc.contacts.search_placeholder}
        placeholderTextColor={colors.placeholderTextColor}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="ContactSearchInput"
      />
      <FlatList
        data={results}
        keyExtractor={item => item.address}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <ContactRow
            contact={item}
            onPress={() => navigation.navigate('ContactDetail', { address: item.address })}
            testID={`Contact-${item.address}`}
          />
        )}
      />
    </SafeArea>
  );
};

export default ContactList;

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  search: { height: 44, borderRadius: 12, paddingHorizontal: 12, marginTop: 12 },
  listContent: { paddingVertical: 12 },
});
