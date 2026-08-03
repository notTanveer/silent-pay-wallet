import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';

import Clipboard from '@react-native-clipboard/clipboard';

import ContactAvatar from '../../components/ContactAvatar';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import { useTheme } from '../../components/themes';
import { ClashFont } from '../../constants/fonts';
import { truncateContactAddress } from '../../class/contacts';
import confirm from '../../helpers/confirm';
import { useContacts } from '../../hooks/context/useContacts';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';
import { DetailViewStackParamList } from '../../navigation/DetailViewStackParamList';
import { useStorage } from '../../hooks/context/useStorage';
import CopyIcon from '../../components/icons/CopyIcon';
import EditIcon from '../../components/icons/EditIcon';
import InfoIcon from '../../components/icons/InfoIcon';
import PaperPlaneIcon from '../../components/icons/PaperPlaneIcon';
import TrashIcon from '../../components/icons/TrashIcon';

type RouteProps = RouteProp<DetailViewStackParamList, 'ContactDetail'>;

const ContactDetail: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const { params } = useRoute<RouteProps>();
  const { getContact, deleteContact } = useContacts();
  const { wallets } = useStorage();

  const contact = getContact(params.address);

  // Covers deletion and any other path that leaves the route param pointing at a missing key.
  useEffect(() => {
    if (contact === undefined) navigation.goBack();
  }, [contact, navigation]);

  const HeaderRight = useMemo(
    () => (
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('ContactEdit', { mode: 'edit', address: params.address })}
        testID="ContactEditButton"
        style={styles.editButton}
      >
        <EditIcon size={20} color={colors.brandPrimary} />
        <Text style={[styles.editLabel, { color: colors.brandPrimary }]}>{loc._.edit}</Text>
      </Pressable>
    ),
    [navigation, params.address, colors.brandPrimary],
  );

  useEffect(() => {
    navigation.setOptions({ headerRight: () => HeaderRight });
  }, [navigation, HeaderRight]);

  if (contact === undefined) return null;

  const onPay = () => {
    if (wallets.length === 0) return;
    navigation.navigate('SendDetailsRoot', { walletID: wallets[0].getID(), address: params.address });
  };

  const onCopyAddress = () => Clipboard.setString(params.address);

  const onRemove = async () => {
    if (!(await confirm(loc.contacts.remove_confirm_title, loc.contacts.remove_confirm_message))) return;
    await deleteContact(params.address);
    navigation.goBack();
  };

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ContactAvatar name={contact.name} address={params.address} size={72} borderRadius={24} />
        <View style={styles.nameBlock}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
            {contact.name}
          </Text>
          <Text style={[styles.subtitle, { color: colors.chevron }]} numberOfLines={1}>
            {truncateContactAddress(params.address)}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onPay}
        testID="ContactPayButton"
        style={[styles.pay, { backgroundColor: colors.brandPrimary }]}
      >
        <PaperPlaneIcon size={20} color={colors.white} />
        <Text style={[styles.payText, { color: colors.white }]}>{loc.contacts.pay}</Text>
      </Pressable>

      <View style={styles.addressSection}>
        <View style={styles.addressHead}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{loc.contacts.label_address}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onCopyAddress}
            testID="ContactCopyAddressIconButton"
            style={[styles.copyButton, { backgroundColor: colors.background, borderColor: colors.copyButtonBorder }]}
          >
            <CopyIcon size={16} color={colors.chevron} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onCopyAddress}
          testID="ContactCopyAddressButton"
          style={[styles.addressBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.accentSubtle }]}
        >
          <Text style={[styles.address, { color: colors.textPrimary }]}>{params.address}</Text>
        </Pressable>
      </View>

      <View style={[styles.notice, { backgroundColor: colors.surfaceSubtle }]}>
        <InfoIcon size={20} color={colors.brandPrimary} />
        <Text style={[styles.noticeText, { color: colors.noticeText }]}>{loc.contacts.reuse_notice}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onRemove}
        testID="ContactRemoveButton"
        style={[styles.remove, { backgroundColor: colors.removeSurface, borderColor: colors.removeBorder }]}
      >
        <TrashIcon size={20} color={colors.redText} />
        <Text style={[styles.removeText, { color: colors.redText }]}>{loc.contacts.remove}</Text>
      </Pressable>
    </SafeAreaScrollView>
  );
};

export default ContactDetail;

const styles = StyleSheet.create({
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editLabel: { fontFamily: ClashFont.medium, fontSize: 16 },
  content: { paddingHorizontal: 24, paddingTop: 24, gap: 24 },
  header: { alignItems: 'center', gap: 12 },
  nameBlock: { alignItems: 'center', gap: 4 },
  name: { fontFamily: ClashFont.medium, fontSize: 28, letterSpacing: -1 },
  subtitle: { fontFamily: ClashFont.regular, fontSize: 15 },
  pay: { flexDirection: 'row', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 9 },
  payText: { fontFamily: ClashFont.medium, fontSize: 16 },
  addressSection: { gap: 8 },
  addressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: ClashFont.medium, fontSize: 14 },
  copyButton: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressBox: { borderRadius: 16, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  address: { fontFamily: ClashFont.regular, fontSize: 14, lineHeight: 22 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, paddingVertical: 19, paddingHorizontal: 12, gap: 10 },
  noticeText: { flex: 1, fontFamily: ClashFont.regular, fontSize: 12, lineHeight: 20 },
  remove: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  removeText: { fontFamily: ClashFont.medium, fontSize: 16 },
});
