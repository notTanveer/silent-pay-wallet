import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';

import { ContactError, MAX_CONTACT_NAME_LENGTH, normalizeAddress, validateContact } from '../../class/contacts';
import presentAlert from '../../components/Alert';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import { useTheme } from '../../components/themes';
import { ClashFont } from '../../constants/fonts';
import { useContacts } from '../../hooks/context/useContacts';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';
import { DetailViewStackParamList } from '../../navigation/DetailViewStackParamList';

type RouteProps = RouteProp<DetailViewStackParamList, 'ContactEdit'>;

const addressMessage = (errors: ContactError[]): { text: string; ok: boolean } | null => {
  const error = errors.find(e => e.field === 'address');
  if (error === undefined) return { text: loc.contacts.address_valid, ok: true };
  if (error.code === 'invalid') return { text: loc.contacts.address_invalid, ok: false };
  if (error.code === 'duplicate') {
    return { text: loc.formatString(loc.contacts.address_duplicate, { name: error.conflictName }), ok: false };
  }
  return null; // 'empty' renders nothing — an untouched field should not be scolded
};

const ContactEdit: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const { params } = useRoute<RouteProps>();
  const { contacts, getContact, saveContact } = useContacts();

  const editingAddress = params.mode === 'edit' ? params.address : undefined;
  const existing = editingAddress === undefined ? undefined : getContact(editingAddress);

  const [name, setName] = useState(existing?.name ?? '');
  const [address, setAddress] = useState(params.address ?? '');
  const [isSaving, setIsSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: params.mode === 'edit' ? loc.contacts.edit_header : loc.contacts.add_header });
  }, [navigation, params.mode]);

  const errors = useMemo(() => validateContact(contacts, { name, address, editingAddress }), [contacts, name, address, editingAddress]);
  const message = addressMessage(errors);
  const canSave = errors.length === 0 && !isSaving;

  // Where a save lands depends on how the screen was reached. Kept out of onSave so the save
  // itself reads as save-then-navigate rather than three returns inside a try block.
  const navigateAfterSave = () => {
    if (params.origin === 'success') {
      // Returning to the success sheet of an already-sent payment is a dead end, so drop
      // the send stack entirely and land on the list with back going Home.
      navigation.reset({ index: 1, routes: [{ name: 'WalletsList' }, { name: 'Contacts' }] });
      return;
    }

    const normalized = normalizeAddress(address);
    if (editingAddress !== undefined && normalized !== normalizeAddress(editingAddress)) {
      // The old key is gone, so ContactDetail's route param is stale. navigate() targets the
      // ContactDetail already on the stack and merges params rather than pushing a duplicate.
      navigation.navigate('ContactDetail', { address: normalized });
      return;
    }

    navigation.goBack();
  };

  const onSave = async () => {
    setIsSaving(true);
    try {
      await saveContact({ name, address, editingAddress });
      navigateAfterSave();
    } catch (error: any) {
      presentAlert({ message: error?.message ?? String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{loc.contacts.label_name}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.fieldBackground, color: colors.foregroundColor }]}
        placeholder={loc.contacts.name_placeholder}
        placeholderTextColor={colors.placeholderTextColor}
        value={name}
        onChangeText={setName}
        maxLength={MAX_CONTACT_NAME_LENGTH}
        testID="ContactNameInput"
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>{loc.contacts.label_address}</Text>
      <TextInput
        style={[styles.input, styles.addressInput, { backgroundColor: colors.fieldBackground, color: colors.foregroundColor }]}
        placeholder={loc.contacts.address_placeholder}
        placeholderTextColor={colors.placeholderTextColor}
        value={address}
        onChangeText={setAddress}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        testID="ContactAddressInput"
      />
      {message !== null && (
        <Text style={[styles.message, { color: message.ok ? colors.success : colors.redText }]} testID="ContactAddressMessage">
          {message.text}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        disabled={!canSave}
        onPress={onSave}
        testID="ContactSaveButton"
        style={[styles.save, { backgroundColor: canSave ? colors.brandPrimary : colors.accentSubtle }]}
      >
        <Text style={[styles.saveText, { color: canSave ? colors.white : colors.textSecondary }]}>{loc.contacts.save}</Text>
      </Pressable>
    </SafeAreaScrollView>
  );
};

export default ContactEdit;

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  label: { fontFamily: ClashFont.regular, fontSize: 14 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addressInput: { minHeight: 80, textAlignVertical: 'top' },
  message: { fontFamily: ClashFont.regular, fontSize: 13 },
  save: { marginTop: 24, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: ClashFont.medium, fontSize: 16 },
});
