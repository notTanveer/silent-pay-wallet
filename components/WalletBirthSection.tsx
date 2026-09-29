import React from 'react';
import { Platform } from 'react-native';
import FieldTextInput from './FieldTextInput';
import LabeledField from './LabeledField';
import loc from '../loc';

interface WalletBirthSectionProps {
  birthDate: string;
  setBirthDate: (value: string) => void;
}

export const WalletBirthSection: React.FC<WalletBirthSectionProps> = ({ birthDate, setBirthDate }) => (
  <LabeledField label={loc.wallet_birth.birth_date_label} testID="BirthDateField">
    <FieldTextInput
      value={birthDate}
      onChangeText={setBirthDate}
      placeholder={loc.wallet_birth.birth_date_placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
      returnKeyType="done"
      testID="BirthDateInput"
    />
  </LabeledField>
);
