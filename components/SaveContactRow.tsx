import React, { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { isValidContactAddress, MAX_CONTACT_NAME_LENGTH } from '../class/contacts';
import { ClashFont } from '../constants/fonts';
import { useContacts } from '../hooks/context/useContacts';
import loc from '../loc';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../modules/hapticFeedback';
import ActionButton from './ActionButton';
import presentAlert from './Alert';
import FieldTextInput from './FieldTextInput';
import CheckmarkIcon from './icons/CheckmarkIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import SaveIcon from './icons/SaveIcon';
import { useTheme } from './themes';

interface SaveContactRowProps {
  address?: string;
  saved?: React.ReactNode;
  pill?: boolean;
}

const SaveContactRow: React.FC<SaveContactRowProps> = ({ address, saved, pill }) => {
  const { colors } = useTheme();
  const { getContact, saveContact } = useContacts();
  const [name, setName] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setName(null);
    setJustSaved(false);
  }, [address]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setJustSaved(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const onSave = useCallback(async () => {
    const trimmed = name?.trim();
    if (!address || !trimmed) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setName(null); // nothing typed — the row goes back to being an offer
      return;
    }

    try {
      await saveContact({ name: trimmed, address });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setName(null);
      setJustSaved(true);
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
    } catch (error: any) {
      presentAlert({ title: loc.errors.error, message: error?.message ?? String(error) });
    }
  }, [address, name, saveContact]);

  const onOpen = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setName('');
  }, []);

  if (justSaved) {
    return (
      <View
        style={[styles.row, styles.rowSolid, { backgroundColor: colors.contactSavedSurface, borderColor: colors.contactSavedAccent }]}
        testID="SaveContactReceipt"
      >
        <View style={[styles.savedCheck, { borderColor: colors.contactSavedAccent }]}>
          <CheckmarkIcon size={12} color={colors.contactSavedAccent} />
        </View>
        <Text style={[styles.text, { color: colors.contactSavedAccent }]}>{loc.contacts.saved_to_contacts}</Text>
      </View>
    );
  }

  if (address === undefined || !isValidContactAddress(address) || getContact(address) !== undefined) {
    return <>{saved}</>;
  }

  if (name === null) {
    return pill ? (
      <ActionButton
        title={loc.contacts.save_as_contact}
        onPress={onOpen}
        Icon={SaveIcon}
        iconSize={20}
        backgroundColor={colors.surfaceSubtle}
        color={colors.brandPrimary}
        style={styles.pill}
        testID="SaveContactButton"
      />
    ) : (
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.row, { backgroundColor: colors.cardBackground, borderColor: colors.dashedBorder }]}
        testID="SaveContactButton"
      >
        <SaveIcon size={20} color={colors.brandPrimary} />
        <Text style={[styles.text, { color: colors.brandPrimary }]}>{loc.contacts.save_as_contact}</Text>
        <ChevronRightIcon color={colors.chevron} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, styles.rowSolid, styles.card, { backgroundColor: colors.surfaceSubtle, borderColor: colors.accentSubtle }]}>
      <View style={styles.cardLabel}>
        <SaveIcon size={20} color={colors.brandPrimary} />
        <Text style={[styles.labelText, { color: colors.brandPrimary }]}>{loc.contacts.save_as_contact}</Text>
      </View>
      <View style={styles.cardRow}>
        <FieldTextInput
          autoFocus
          style={styles.nameInput}
          accessibilityLabel={loc.contacts.label_name}
          placeholder={loc.contacts.name_placeholder}
          value={name}
          onChangeText={setName}
          // return blurs the field, so blur is the only commit path — tapping away commits too
          onBlur={onSave}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={MAX_CONTACT_NAME_LENGTH}
          returnKeyType="done"
          testID="SaveContactNameInput"
        />
      </View>
    </View>
  );
};

export default SaveContactRow;

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 15,
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  pill: {
    alignSelf: 'stretch',
  },
  rowSolid: {
    borderStyle: 'solid',
  },
  card: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 2,
    paddingVertical: 10,
  },
  cardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // matches the collapsed row, so the label does not shift sideways as it shrinks
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    fontFamily: ClashFont.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  labelText: {
    fontFamily: ClashFont.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  nameInput: {
    fontFamily: ClashFont.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  savedCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
