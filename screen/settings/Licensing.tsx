import React from 'react';
import { StyleSheet, Text } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsCard from '../../components/SettingsCard';
import { useTheme } from '../../components/themes';
import { ClashFont } from '../../constants/fonts';
import { LICENSE_COPYRIGHT, LICENSE_PARAGRAPHS, LICENSE_TITLE } from '../../constants/license';

const Licensing: React.FC = () => {
  const { colors } = useTheme();

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} testID="LicensingScrollView">
      <SettingsCard style={styles.card}>
        <Text style={[styles.title, { color: colors.settingsRowTitle }]}>{LICENSE_TITLE}</Text>
        {LICENSE_COPYRIGHT.map(line => (
          <Text key={line} style={[styles.copyright, { color: colors.alternativeTextColor }]}>
            {line}
          </Text>
        ))}
        {LICENSE_PARAGRAPHS.map(p => (
          <Text key={p} style={[styles.body, { color: colors.settingsDescriptionText }]}>
            {p}
          </Text>
        ))}
      </SettingsCard>
    </SafeAreaScrollView>
  );
};

export default Licensing;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
  },
  copyright: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
    marginTop: 6,
  },
  body: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    lineHeight: 21,
    marginTop: 20,
  },
});
