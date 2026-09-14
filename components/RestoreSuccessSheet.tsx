import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import ActionButton from './ActionButton';
import BottomModal, { BottomModalHandle } from './BottomModal';
import SuccessCheckIcon from './icons/SuccessCheckIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';
import loc from '../loc';

export interface RestoreSuccessSheetHandle {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface RestoreSuccessSheetProps {
  onDone: () => void;
}

// Shown once a restored wallet has been saved, before handing off to the wallets list.
const RestoreSuccessSheet = forwardRef<RestoreSuccessSheetHandle, RestoreSuccessSheetProps>(({ onDone }, ref) => {
  const { colors } = useTheme();
  const modalRef = useRef<BottomModalHandle>(null);

  useImperativeHandle(ref, () => ({
    present: async () => {
      await modalRef.current?.present();
    },
    dismiss: async () => {
      await modalRef.current?.dismiss();
    },
  }));

  return (
    <BottomModal
      ref={modalRef}
      showCloseButton={false}
      isGrabberVisible={false}
      dismissible={false}
      backgroundColor={colors.background}
      sizes={Platform.OS === 'ios' ? ['auto'] : [420, 'auto']}
    >
      <View style={styles.container} testID="RestoreSuccessSheet">
        <View style={styles.icon}>
          <SuccessCheckIcon size={60} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{loc.wallets.restore_success_title}</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{loc.wallets.restore_success_message}</Text>
        <ActionButton
          title={loc.wallets.restore_success_done}
          onPress={onDone}
          backgroundColor={colors.brandPrimary}
          color={colors.white}
          style={styles.button}
          testID="RestoreSuccessDoneButton"
        />
      </View>
    </BottomModal>
  );
});

export default RestoreSuccessSheet;

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingBottom: 24 },
  icon: { marginBottom: 16 },
  title: { fontFamily: ClashFont.medium, fontSize: 20, textAlign: 'center', marginBottom: 8 },
  message: { fontFamily: ClashFont.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  button: { width: '100%' },
});
