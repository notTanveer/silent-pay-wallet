import React, { useCallback } from 'react';
import { Keyboard, StyleSheet, Text } from 'react-native';
import ToolTipMenu from './TooltipMenu';
import loc from '../loc';
import { showFilePickerAndReadFile, showImagePickerAndReadImage } from '../modules/fs';
import presentAlert from './Alert';
import { useTheme } from './themes';
import { CommonToolTipActions } from '../typings/CommonToolTipActions';
import { scanQrHelper } from '../helpers/scan-qr';
import { actionButtonStyles } from './ActionButton';

interface AddressInputScanButtonProps {
  isLoading?: boolean;
  onChangeText: (text: string) => void;
  testID?: string;
  beforePress?: () => Promise<void> | void;
}

// Pasting is left to the screen's own paste controls, so the menu only offers photo and file.
const ACTIONS = [CommonToolTipActions.ChoosePhoto, CommonToolTipActions.ImportFile];

// Outlined pill that scans a QR code on tap and offers photo/file import on long press.
export const AddressInputScanButton = ({
  isLoading,
  onChangeText,
  testID = 'BlueAddressInputScanQrButton',
  beforePress,
}: AddressInputScanButtonProps) => {
  const { colors } = useTheme();

  const toolTipOnPress = useCallback(async () => {
    if (beforePress) {
      await beforePress();
    }
    Keyboard.dismiss();
    scanQrHelper().then(onChangeText);
  }, [beforePress, onChangeText]);

  const onMenuItemPressed = useCallback(
    async (action: string) => {
      switch (action) {
        case CommonToolTipActions.ChoosePhoto.id:
          showImagePickerAndReadImage()
            .then(value => {
              if (value) {
                onChangeText(value);
              }
            })
            .catch(error => {
              presentAlert({ message: error.message });
            });
          break;
        case CommonToolTipActions.ImportFile.id:
          showFilePickerAndReadFile()
            .then(value => {
              if (value.data) {
                onChangeText(value.data);
              }
            })
            .catch(error => {
              presentAlert({ message: error.message });
            });
          break;
      }
      Keyboard.dismiss();
    },
    [onChangeText],
  );

  return (
    <ToolTipMenu
      actions={ACTIONS}
      isButton
      onPressMenuItem={onMenuItemPressed}
      testID={testID}
      disabled={isLoading}
      onPress={toolTipOnPress}
      buttonStyle={[actionButtonStyles.button, actionButtonStyles.outlined, styles.fullWidth, { borderColor: colors.accentSubtle }]}
      accessibilityLabel={loc.send.details_scan}
      accessibilityHint={loc.send.details_scan_hint}
    >
      <Text style={[actionButtonStyles.title, { color: colors.brandPrimary }]}>{loc.wallets.import_scan_qr}</Text>
    </ToolTipMenu>
  );
};

AddressInputScanButton.displayName = 'AddressInputScanButton';

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
});
