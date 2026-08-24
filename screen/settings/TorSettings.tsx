import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsRowWrapper from '../../components/SettingsRowWrapper';
import SettingsCard from '../../components/SettingsCard';
import SettingsSectionHeader from '../../components/SettingsSectionHeader';
import SettingsToggleRow from '../../components/SettingsToggleRow';
import InfoBanner from '../../components/InfoBanner';
import SettingsTextInput from '../../components/SettingsTextInput';
import Button from '../../components/Button';
import ChevronUpIcon from '../../components/icons/ChevronUpIcon';
import DownloadIcon from '../../components/icons/DownloadIcon';
import presentAlert from '../../components/Alert';
import { useTheme } from '../../components/themes';
import { useSettings } from '../../hooks/context/useSettings';
import TorManager, { TorStatus } from '../../modules/torManager';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

interface InfoRowProps {
  title: string;
  value: string;
  valueColor: string;
  showSeparator?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ title, value, valueColor, showSeparator = true }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <View style={styles.infoRow}>
        <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{title}</Text>
        <Text style={[styles.rowTitle, { color: valueColor }]}>{value}</Text>
      </View>
    </SettingsRowWrapper>
  );
};

const statusLabel = (status: TorStatus): string => {
  switch (status) {
    case 'connected':
      return loc.settings.tor_status_connected;
    case 'checking':
      return loc.settings.tor_status_checking;
    case 'unavailable':
      return loc.settings.tor_status_unavailable;
    default:
      return loc.settings.tor_status_disabled;
  }
};

const TorSettings: React.FC = () => {
  const { colors } = useTheme();
  const { isTorEnabled, setIsTorEnabled, isTorOnly, setIsTorOnly, torSocksPort, setTorSocksPort, torStatus, checkTorConnection } =
    useSettings();
  const [isOrbotInstalled, setIsOrbotInstalled] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const [portInput, setPortInput] = useState(String(torSocksPort));

  useEffect(() => {
    setPortInput(String(torSocksPort));
  }, [torSocksPort]);

  useFocusEffect(
    useCallback(() => {
      TorManager.isOrbotInstalled().then(setIsOrbotInstalled);
    }, []),
  );

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await checkTorConnection();
    } finally {
      setIsTesting(false);
    }
  };

  const handleSavePort = async () => {
    const parsed = Number(portInput);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      presentAlert({ message: loc.settings.tor_invalid_port });
      return;
    }
    const success = await setTorSocksPort(parsed);
    if (success) {
      triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
      presentAlert({ message: loc.settings.tor_port_saved });
    } else {
      presentAlert({ message: loc.settings.tor_invalid_port });
    }
  };

  const statusColor =
    torStatus === 'connected'
      ? colors.settingsNetworkIconColor
      : torStatus === 'unavailable'
        ? colors.statusError
        : colors.alternativeTextColor;
  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" testID="TorSettingsScrollView">
      <Text style={[styles.titleText, { color: colors.settingsRowTitle }]}>{loc.settings.tor_use_tor_title}</Text>
      <Text style={[styles.description, { color: colors.settingsDescriptionText }]}>{loc.settings.tor_use_tor_description}</Text>

      <InfoBanner text={loc.settings.tor_orbot_info} containerStyle={styles.sectionHeaderGap} />

      <SettingsCard style={styles.sectionHeaderGap}>
        <SettingsRowWrapper showSeparator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={loc.settings.tor_install_orbot}
            onPress={() => TorManager.openOrbotInstallPage()}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            android_ripple={{ color: colors.settingsRipple }}
            testID="InstallOrbotLink"
          >
            <Text style={[styles.toggleRowTitle, { color: colors.settingsRowTitle }]}>{loc.settings.tor_install_orbot}</Text>
            <View style={styles.downloadIcon}>
              <DownloadIcon color={colors.settingsRowTitle} size={18} />
            </View>
          </Pressable>
        </SettingsRowWrapper>
      </SettingsCard>

      <SettingsCard style={styles.sectionHeaderGap}>
        <SettingsToggleRow
          title={loc.settings.tor_enable_tor}
          value={isTorEnabled}
          onValueChange={setIsTorEnabled}
          testID="EnableTorSwitch"
        />
        <SettingsToggleRow
          title={loc.settings.tor_only_mode}
          subtitle={loc.settings.tor_only_mode_subtitle}
          value={isTorOnly}
          onValueChange={setIsTorOnly}
          disabled={!isTorEnabled}
          showSeparator={false}
          testID="TorOnlySwitch"
        />
        {isTorOnly && <InfoBanner variant="caution" text={loc.settings.tor_only_warning} containerStyle={styles.torOnlyWarning} />}
      </SettingsCard>

      <SettingsSectionHeader style={[styles.sectionHeaderSizeOverride, styles.sectionHeaderGap]}>
        {loc.settings.tor_orbot_section}
      </SettingsSectionHeader>
      <SettingsCard>
        <InfoRow
          title={loc.settings.tor_orbot_installed_label}
          value={isOrbotInstalled ? loc.settings.tor_installed : loc.settings.tor_not_installed}
          valueColor={isOrbotInstalled ? colors.settingsNetworkIconColor : colors.statusError}
        />
        <InfoRow
          title={loc.settings.tor_orbot_status_label}
          value={statusLabel(torStatus)}
          valueColor={statusColor}
          showSeparator={false}
        />
      </SettingsCard>
      <Button
        testID="TestTorConnection"
        title={loc.settings.tor_test_connection}
        backgroundColor={colors.settingsNetworkIconColor}
        disabled={!isTorEnabled || isTesting}
        showActivityIndicator={isTesting}
        onPress={handleTestConnection}
        style={styles.sectionHeaderGap}
      />

      <Pressable
        style={[styles.advancedHeader, styles.sectionHeaderGap]}
        onPress={() => setIsAdvancedExpanded(v => !v)}
        testID="ToggleAdvanced"
      >
        <SettingsSectionHeader style={[styles.sectionHeaderSizeOverride, styles.advancedHeaderText]}>
          {loc.settings.tor_advanced}
        </SettingsSectionHeader>
        <View style={[styles.advancedChevron, { transform: [{ rotate: isAdvancedExpanded ? '0deg' : '180deg' }] }]}>
          <ChevronUpIcon color={colors.alternativeTextColor} size={18} />
        </View>
      </Pressable>
      {isAdvancedExpanded && (
        <SettingsCard>
          <View style={styles.advancedContent}>
            <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{loc.settings.tor_socks_port_label}</Text>
            <Text style={[styles.rowSubtitle, styles.portDescription, { color: colors.alternativeTextColor }]}>
              {loc.settings.tor_socks_port_description}
            </Text>
            <SettingsTextInput
              testID="TorSocksPortInput"
              value={portInput}
              onChangeText={setPortInput}
              keyboardType="number-pad"
              style={styles.portInput}
            />
            <Button testID="SaveTorPort" title={loc.settings.tor_save_port} onPress={handleSavePort} style={styles.saveButton} />
          </View>
        </SettingsCard>
      )}
    </SafeAreaScrollView>
  );
};

export default TorSettings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  titleText: {
    fontSize: 16,
    fontFamily: ClashFont.regular,
    marginBottom: 8,
  },
  // SettingsSectionHeader defaults to fontSize 14 + marginLeft 4 - this screen's section
  // labels are sized like titleText instead, with no left margin.
  sectionHeaderSizeOverride: {
    fontSize: 16,
    marginLeft: 0,
  },
  sectionHeaderGap: {
    marginTop: 16,
  },
  torOnlyWarning: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: ClashFont.regular,
  },
  toggleRowTitle: {
    fontSize: 14,
    fontFamily: ClashFont.medium,
  },
  downloadIcon: {
    marginRight: 18,
  },
  rowSubtitle: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginTop: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  advancedHeaderText: {
    marginBottom: 0,
  },
  advancedChevron: {
    marginLeft: 6,
  },
  advancedContent: {
    padding: 16,
  },
  portDescription: {
    marginTop: 4,
    marginBottom: 12,
  },
  portInput: {
    marginBottom: 16,
  },
  saveButton: {
    marginTop: 0,
  },
});
