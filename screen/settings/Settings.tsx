import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsIconWrapper from '../../components/icons/SettingsIconWrapper';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import GeneralIcon from '../../components/icons/GeneralIcon';
import CurrencyIcon from '../../components/icons/CurrencyIcon';
import ContactIcon from '../../components/icons/ContactIcon';
import SecurityIcon from '../../components/icons/SecurityIcon';
import NetworkIcon from '../../components/icons/NetworkIcon';
import ToolsIcon from '../../components/icons/ToolsIcon';
import AboutIcon from '../../components/icons/AboutIcon';
import { useTheme } from '../../components/themes';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { useDeleteWallet } from '../../hooks/useDeleteWallet';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';
import { IconProps } from '../../components/icons/types';

const APP_VERSION = DeviceInfo.getVersion();
const BUILD_NUMBER = DeviceInfo.getBuildNumber();

type SettingsRoute = 'General' | 'Currency' | 'Contact' | 'EncryptStorage' | 'ElectrumSettings' | 'Tools' | 'About';

type SettingsIconColorToken =
  | 'settingsGeneralIconColor'
  | 'settingsCurrencyIconColor'
  | 'settingsContactIconColor'
  | 'settingsSecurityIconColor'
  | 'settingsNetworkIconColor'
  | 'settingsToolsIconColor'
  | 'settingsAboutIconColor';

interface RowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  testID?: string;
  showSeparator?: boolean;
}

interface RowConfig {
  Icon: React.FC<IconProps>;
  colorToken: SettingsIconColorToken;
  title: string;
  subtitle: string;
  route: SettingsRoute;
  testID: string;
}

const Row: React.FC<RowProps> = ({ icon, title, subtitle, onPress, testID, showSeparator = true }) => {
  const { colors } = useTheme();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        style={({ pressed }) => [styles.row, pressed && Platform.OS !== 'android' && styles.rowPressed]}
        onPress={onPress}
        testID={testID}
        android_ripple={{ color: colors.settingsRipple }}
      >
        <SettingsIconWrapper>{icon}</SettingsIconWrapper>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}>{subtitle}</Text>
        </View>
        <ChevronRightIcon />
      </Pressable>
      {showSeparator && <View style={[styles.separator, { backgroundColor: colors.settingsCardBorder }]} />}
    </View>
  );
};

const MAIN_ROWS: RowConfig[] = [
  {
    Icon: GeneralIcon,
    colorToken: 'settingsGeneralIconColor',
    title: loc.settings.general,
    subtitle: loc.settings.general_subtitle,
    route: 'General',
    testID: 'GeneralButton',
  },
  {
    Icon: CurrencyIcon,
    colorToken: 'settingsCurrencyIconColor',
    title: loc.settings.currency,
    subtitle: loc.settings.currency_subtitle,
    route: 'Currency',
    testID: 'CurrencyButton',
  },
  {
    Icon: ContactIcon,
    colorToken: 'settingsContactIconColor',
    title: loc.settings.contact,
    subtitle: loc.settings.contact_subtitle,
    route: 'Contact',
    testID: 'ContactButton',
  },
  {
    Icon: SecurityIcon,
    colorToken: 'settingsSecurityIconColor',
    title: loc.settings.encrypt_title,
    subtitle: loc.settings.security_subtitle,
    route: 'EncryptStorage',
    testID: 'SecurityButton',
  },
  {
    Icon: NetworkIcon,
    colorToken: 'settingsNetworkIconColor',
    title: loc.settings.network,
    subtitle: loc.settings.network_subtitle,
    route: 'ElectrumSettings',
    testID: 'NetworkButton',
  },
];

const SECONDARY_ROWS: RowConfig[] = [
  {
    Icon: ToolsIcon,
    colorToken: 'settingsToolsIconColor',
    title: loc.settings.tools,
    subtitle: loc.settings.tools_subtitle,
    route: 'Tools',
    testID: 'ToolsButton',
  },
  {
    Icon: AboutIcon,
    colorToken: 'settingsAboutIconColor',
    title: loc.settings.about,
    subtitle: `v${APP_VERSION} (build ${BUILD_NUMBER})`,
    route: 'About',
    testID: 'AboutButton',
  },
];

const Settings: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const handleDeleteWallet = useDeleteWallet();

  const cardStyle = [styles.card, { borderColor: colors.settingsCardBorder, backgroundColor: colors.settingsCardBackground }];

  return (
    <SafeAreaScrollView
      contentContainerStyle={styles.content}
      floatingButtonHeight={24}
      showsVerticalScrollIndicator={false}
      testID="SettingsScrollView"
    >
      <View style={cardStyle}>
        {MAIN_ROWS.map((row, index) => (
          <Row
            key={row.route}
            icon={<row.Icon color={colors[row.colorToken]} />}
            title={row.title}
            subtitle={row.subtitle}
            onPress={() => navigation.navigate(row.route)}
            testID={row.testID}
            showSeparator={index < MAIN_ROWS.length - 1}
          />
        ))}
      </View>

      <View style={[cardStyle, styles.cardGap]}>
        {SECONDARY_ROWS.map((row, index) => (
          <Row
            key={row.route}
            icon={<row.Icon color={colors[row.colorToken]} />}
            title={row.title}
            subtitle={row.subtitle}
            onPress={() => navigation.navigate(row.route)}
            testID={row.testID}
            showSeparator={index < SECONDARY_ROWS.length - 1}
          />
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={loc.settings.delete_wallet}
        style={[styles.deleteWalletButton, styles.cardGap, { borderColor: colors.settingsDeleteWallet }]}
        onPress={handleDeleteWallet}
        testID="DeleteWalletButton"
        activeOpacity={0.7}
      >
        <Text style={[styles.deleteWalletText, { color: colors.settingsDeleteWallet }]}>{loc.settings.delete_wallet}</Text>
      </TouchableOpacity>
    </SafeAreaScrollView>
  );
};

export default Settings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardGap: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: ClashFont.regular,
    marginTop: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  deleteWalletButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 20,
    alignItems: 'center',
  },
  deleteWalletText: {
    fontSize: 16,
    fontFamily: ClashFont.semibold,
  },
});
