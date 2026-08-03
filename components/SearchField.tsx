import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import SearchIcon from './icons/SearchIcon';
import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID?: string;
}

/** The one search field. Every list screen that filters gets this, so the two can't drift apart. */
const SearchField: React.FC<SearchFieldProps> = ({ value, onChangeText, placeholder, testID }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.field, { backgroundColor: colors.background, borderColor: colors.searchFieldBorder }]}>
      <SearchIcon size={20} stroke={colors.searchFieldIcon} />
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        placeholder={placeholder}
        placeholderTextColor={colors.searchFieldPlaceholder}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
      />
    </View>
  );
};

export default SearchField;

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    height: 48,
    borderRadius: 16,
    borderWidth: 0.54195,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginTop: 16,
  },
  // padding:0 keeps Android's stock TextInput inset from fighting the 12pt the row already sets.
  input: { flex: 1, padding: 0, fontFamily: ClashFont.regular, fontSize: 16, lineHeight: 20 },
});
