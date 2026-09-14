import React from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsCard from '../../components/SettingsCard';
import SettingsSectionHeader from '../../components/SettingsSectionHeader';
import SettingsNavRow from '../../components/SettingsNavRow';
import SettingsStatRow from '../../components/SettingsStatRow';
import DiscordIcon from '../../components/icons/DiscordIcon';
import GithubIcon from '../../components/icons/GithubIcon';
import InfoIcon from '../../components/icons/InfoIcon';
import { useTheme } from '../../components/themes';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

const APP_VERSION = DeviceInfo.getVersion();
const BUILD_NUMBER = DeviceInfo.getBuildNumber();
const shroudLogo = require('../../img/icon.png');

const About: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();

  const handleOnDiscordPress = () => {
    Linking.openURL('https://discord.com/invite/STeQFVEWf9');
  };

  const handleOnGithubPress = () => {
    Linking.openURL('https://github.com/Bitshala-Incubator/silent-pay-wallet');
  };

  const handleOnWebsitePress = () => {
    Linking.openURL('https://shroudwallet.app/');
  };

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} testID="AboutScrollView">
      <View style={styles.hero}>
        <Image source={shroudLogo} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.appName, { color: colors.primary }]}>{loc.settings.about_app_name}</Text>
        <Text style={[styles.description, { color: colors.alternativeTextColor }]}>{loc.settings.about_free}</Text>
      </View>

      <View style={[styles.warningBanner, { backgroundColor: colors.surfaceCaution }]}>
        <View style={styles.warningIcon}>
          <InfoIcon size={20} color={colors.settingsWarningTextColor} />
        </View>
        <View style={styles.warningTextContainer}>
          <Text style={[styles.warningTitle, { color: colors.settingsWarningTextColor }]}>{loc.settings.warning_title}</Text>
          <Text style={[styles.warningText, { color: colors.settingsWarningTextColor }]}>{loc.settings.warning}</Text>
        </View>
      </View>

      <SettingsSectionHeader style={styles.sectionHeaderGap}>{loc.settings.about_community_header}</SettingsSectionHeader>
      <SettingsCard>
        <SettingsNavRow
          icon={<DiscordIcon size={20} color={colors.settingsDiscordIconColor} />}
          title={loc.settings.about_sm_discord}
          subtitle={loc.settings.about_sm_discord_subtitle}
          onPress={handleOnDiscordPress}
          testID="DiscordRow"
        />
        <SettingsNavRow
          icon={<GithubIcon size={20} color={colors.settingsGithubIconColor} />}
          title={loc.settings.about_sm_github}
          subtitle={loc.settings.about_sm_github_subtitle}
          onPress={handleOnGithubPress}
          testID="GithubRow"
        />
        <SettingsNavRow
          icon={<Image source={shroudLogo} style={styles.linkRowLogo} resizeMode="contain" />}
          title={loc.settings.about_sm_website}
          subtitle={loc.settings.about_sm_website_subtitle}
          onPress={handleOnWebsitePress}
          showSeparator={false}
          testID="WebsiteRow"
        />
      </SettingsCard>

      <SettingsSectionHeader style={styles.sectionHeaderGap}>{loc.settings.about_version_header}</SettingsSectionHeader>
      <SettingsCard>
        <SettingsStatRow title={loc.settings.about_version} value={`v${APP_VERSION} (build ${BUILD_NUMBER})`} />
        <SettingsNavRow
          title={loc.settings.license}
          onPress={() => navigation.navigate('Licensing')}
          showSeparator={false}
          testID="LicenseRow"
        />
      </SettingsCard>
    </SafeAreaScrollView>
  );
};

export default About;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  hero: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 20,
  },
  appName: {
    fontSize: 22,
    fontFamily: ClashFont.semibold,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    maxWidth: 280,
    fontSize: 14,
    fontFamily: ClashFont.regular,
    lineHeight: 20,
    textAlign: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 19,
    paddingHorizontal: 17,
    gap: 10,
  },
  warningIcon: {
    marginTop: 1,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontFamily: ClashFont.medium,
    fontSize: 15,
  },
  warningText: {
    fontFamily: ClashFont.regular,
    fontSize: 13,
    lineHeight: 23,
    marginTop: 2,
  },
  sectionHeaderGap: {
    marginTop: 24,
  },
  linkRowLogo: {
    width: 20,
    height: 20,
  },
});
