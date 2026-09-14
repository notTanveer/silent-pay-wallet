import React from 'react';
import { StyleSheet, Text } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsCard from '../../components/SettingsCard';
import { useTheme } from '../../components/themes';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

const Licensing: React.FC = () => {
  const { colors } = useTheme();

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} testID="LicensingScrollView">
      <SettingsCard style={styles.card}>
        <Text style={[styles.title, { color: colors.settingsRowTitle }]}>{loc.settings.license_title}</Text>
        <Text style={[styles.copyright, { color: colors.alternativeTextColor }]}>{loc.settings.license_copyright}</Text>

        <Text style={[styles.body, { color: colors.settingsDescriptionText }]}>{loc.settings.license_body_permission}</Text>

        <Text style={[styles.body, { color: colors.settingsDescriptionText }]}>{loc.settings.license_body_notice}</Text>

        <Text style={[styles.body, { color: colors.settingsDescriptionText }]}>{loc.settings.license_body_warranty}</Text>
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
