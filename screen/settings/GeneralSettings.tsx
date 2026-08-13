import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsRowWrapper from '../../components/SettingsRowWrapper';
import ChevronRightIcon from '../../components/icons/ChevronRightIcon';
import Toggle from '../../components/Toggle';
import { useTheme } from '../../components/themes';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import { useSettings } from '../../hooks/context/useSettings';
import { useStorage } from '../../hooks/context/useStorage';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

interface ToggleRowProps {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void | Promise<void>;
  showSeparator?: boolean;
  testID?: string;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ title, subtitle, value, onValueChange, showSeparator = true, testID }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.rowTitle, { color: colors.settingsRowTitle }]}
          >
            {title}
          </Text>
          <Toggle value={value} onValueChange={onValueChange} accessibilityLabel={`${title}, ${subtitle}`} testID={testID} />
        </View>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}
        >
          {subtitle}
        </Text>
      </View>
    </SettingsRowWrapper>
  );
};

interface NavRowProps {
  title: string;
  value: string;
  onPress: () => void;
  showSeparator?: boolean;
  testID?: string;
}

const NavRow: React.FC<NavRowProps> = ({ title, value, onPress, showSeparator = true, testID }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${value}`}
        onPress={onPress}
        style={({ pressed }) => [styles.navRow, pressed && Platform.OS !== 'android' && styles.rowPressed]}
        android_ripple={{ color: colors.settingsRipple }}
        testID={testID}
      >
        <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{title}</Text>
        <View style={styles.navRowValue}>
          <Text style={[styles.navRowValueText, { color: colors.alternativeTextColor }]}>{value}</Text>
          <ChevronRightIcon />
        </View>
      </Pressable>
    </SettingsRowWrapper>
  );
};

const GeneralSettings: React.FC = () => {
  const { colors } = useTheme();
  const navigation = useExtendedNavigation();
  const { wallets } = useStorage();
  const {
    isClipboardGetContentEnabled,
    setIsClipboardGetContentEnabledStorage,
    isWalletShortcutsEnabled,
    setIsWalletShortcutsEnabledStorage,
    isScreenCaptureAllowed,
    setIsScreenCaptureAllowed,
    themePreference,
  } = useSettings();

  const cardStyle = [styles.card, { borderColor: colors.settingsCardBorder, backgroundColor: colors.settingsCardBackground }];

  const themeValueText = useMemo(() => {
    switch (themePreference) {
      case 'light':
        return loc.settings.theme_light;
      case 'dark':
        return loc.settings.theme_dark;
      default:
        return loc.settings.theme_system;
    }
  }, [themePreference]);

  const denominationValueText = useMemo(() => {
    const preferredUnit = wallets[0]?.getPreferredBalanceUnit() ?? BitcoinUnit.BTC;
    return preferredUnit === BitcoinUnit.SATS ? loc.units[BitcoinUnit.SATS] : loc.units[BitcoinUnit.BTC];
  }, [wallets]);

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} testID="GeneralSettingsScrollView">
      <Text style={[styles.sectionHeader, { color: colors.alternativeTextColor }]}>{loc.settings.general_privacy_header}</Text>
      <View style={cardStyle}>
        <ToggleRow
          title={loc.settings.general_read_clipboard_title}
          subtitle={loc.settings.general_read_clipboard_subtitle}
          value={isClipboardGetContentEnabled}
          onValueChange={setIsClipboardGetContentEnabledStorage}
          testID="ReadClipboardSwitch"
        />
        <ToggleRow
          title={loc.settings.general_wallet_shortcuts_title}
          subtitle={loc.settings.general_wallet_shortcuts_subtitle}
          value={isWalletShortcutsEnabled}
          onValueChange={setIsWalletShortcutsEnabledStorage}
          testID="WalletShortcutsSwitch"
        />
        <ToggleRow
          title={loc.settings.general_screen_capture_title}
          subtitle={loc.settings.general_screen_capture_subtitle}
          value={isScreenCaptureAllowed}
          onValueChange={setIsScreenCaptureAllowed}
          showSeparator={false}
          testID="AllowScreenCaptureSwitch"
        />
      </View>

      <Text style={[styles.sectionHeader, styles.sectionHeaderGap, { color: colors.alternativeTextColor }]}>
        {loc.settings.general_display_header}
      </Text>
      <View style={cardStyle}>
        <NavRow title={loc.settings.theme} value={themeValueText} onPress={() => navigation.navigate('ThemeSettings')} testID="ThemeRow" />
        <NavRow
          title={loc.settings.denomination}
          value={denominationValueText}
          onPress={() => navigation.navigate('DenominationSettings')}
          showSeparator={false}
          testID="DenominationRow"
        />
      </View>
    </SafeAreaScrollView>
  );
};

export default GeneralSettings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionHeaderGap: {
    marginTop: 24,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  rowPressed: {
    opacity: 0.7,
  },
  navRowValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navRowValueText: {
    fontSize: 15,
    fontFamily: ClashFont.regular,
    marginRight: 4,
  },
  rowTitle: {
    flexShrink: 1,
    marginRight: 12,
    fontSize: 14,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginTop: 6,
    lineHeight: 18,
  },
});
