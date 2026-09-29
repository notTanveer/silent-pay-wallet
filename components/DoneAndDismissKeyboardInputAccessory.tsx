import React from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { ShroudButtonLink } from '../ShroudComponents';
import loc from '../loc';
import { useTheme } from './themes';
import presentAlert from './Alert';
import { readClipboardForPaste } from '../helpers/clipboard';

interface DoneAndDismissKeyboardInputAccessoryProps {
  /** Omit to hide the Paste action. */
  onPasteTapped?: (clipboard: string) => void;
  onClearTapped: () => void;
}
export const DoneAndDismissKeyboardInputAccessoryViewID = 'DoneAndDismissKeyboardInputAccessory';
export const DoneAndDismissKeyboardInputAccessory: React.FC<DoneAndDismissKeyboardInputAccessoryProps> = props => {
  const { colors } = useTheme();

  const styleHooks = StyleSheet.create({
    container: {
      backgroundColor: colors.fieldBackground,
    },
  });

  const onPasteTapped = async () => {
    try {
      props.onPasteTapped?.(await readClipboardForPaste());
    } catch (error) {
      presentAlert({ message: (error as Error).message });
    }
  };

  const inputView = (
    <View style={[styles.container, styleHooks.container]}>
      <ShroudButtonLink title={loc.send.input_clear} onPress={props.onClearTapped} />
      {props.onPasteTapped && <ShroudButtonLink title={loc.send.input_paste} onPress={onPasteTapped} />}
      <ShroudButtonLink title={loc.send.input_done} onPress={Keyboard.dismiss} />
    </View>
  );

  if (Platform.OS === 'ios') {
    return <InputAccessoryView nativeID={DoneAndDismissKeyboardInputAccessoryViewID}>{inputView}</InputAccessoryView>;
  } else {
    return inputView;
  }
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    maxHeight: 44,
  },
});
