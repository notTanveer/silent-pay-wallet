import React from 'react';
import { KeyboardTypeOptions, StyleProp, StyleSheet, TextInput, TextStyle } from 'react-native';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SettingsTextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  testID?: string;
  style?: StyleProp<TextStyle>;
}

const SettingsTextInput: React.FC<SettingsTextInputProps> = ({
  value,
  onChangeText,
  placeholder,
  editable = true,
  keyboardType = 'default',
  testID,
  style,
}) => {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.alternativeTextColor}
      editable={editable}
      keyboardType={keyboardType}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      style={[styles.input, { color: colors.settingsRowTitle, backgroundColor: colors.background }, style]}
    />
  );
};

export default SettingsTextInput;

const styles = StyleSheet.create({
  input: {
    height: 49,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: ClashFont.regular,
  },
});
