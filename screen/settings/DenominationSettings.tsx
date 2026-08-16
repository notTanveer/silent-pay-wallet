import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsRowWrapper from '../../components/SettingsRowWrapper';
import SatsIcon from '../../components/icons/SatsIcon';
import BitcoinSymbolIcon from '../../components/icons/BitcoinSymbolIcon';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import { useTheme } from '../../components/themes';
import { useStorage } from '../../hooks/context/useStorage';
import { BitcoinUnit } from '../../models/bitcoinUnits';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

interface DenominationRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  showSeparator?: boolean;
  testID?: string;
}

const DenominationRow: React.FC<DenominationRowProps> = ({ icon, title, subtitle, selected, onPress, showSeparator = true, testID }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator} separatorStyle={styles.separator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        style={({ pressed }) => [styles.row, pressed && Platform.OS !== 'android' && styles.rowPressed]}
        onPress={onPress}
        testID={testID}
        android_ripple={{ color: colors.settingsRipple }}
      >
        {icon}
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{title}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.alternativeTextColor }]}>{subtitle}</Text>
        </View>
        {selected && <CheckmarkIcon color={colors.accentColor} size={20} />}
      </Pressable>
    </SettingsRowWrapper>
  );
};

const DenominationSettings: React.FC = () => {
  const { colors } = useTheme();
  const { wallets, saveToDisk } = useStorage();
  const wallet = wallets[0];
  const [preferredUnit, setPreferredUnit] = useState<BitcoinUnit>(wallet?.getPreferredBalanceUnit() ?? BitcoinUnit.BTC);

  const selectUnit = async (unit: BitcoinUnit) => {
    if (!wallet || preferredUnit === unit) return;
    setPreferredUnit(unit);
    wallet.preferredBalanceUnit = unit;
    try {
      await saveToDisk();
    } catch (e) {
      console.error('Error saving preferred balance unit:', e);
    }
  };

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.settingsCardBackground, borderColor: colors.settingsCardBorder }]}>
        <DenominationRow
          icon={<SatsIcon color={colors.settingsDenominationIconColor} backgroundColor={colors.settingsIconWrapperBg} />}
          title={loc.units.sats}
          subtitle={loc.settings.denomination_sats_subtitle}
          selected={preferredUnit === BitcoinUnit.SATS}
          onPress={() => selectUnit(BitcoinUnit.SATS)}
          testID="DenominationSatsOption"
        />
        <DenominationRow
          icon={<BitcoinSymbolIcon color={colors.settingsDenominationIconColor} backgroundColor={colors.settingsIconWrapperBg} />}
          title={loc.units.BTC}
          subtitle={loc.settings.denomination_btc_subtitle}
          selected={preferredUnit === BitcoinUnit.BTC}
          onPress={() => selectUnit(BitcoinUnit.BTC)}
          showSeparator={false}
          testID="DenominationBtcOption"
        />
      </View>
    </SafeAreaScrollView>
  );
};

export default DenominationSettings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    marginLeft: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: ClashFont.medium,
  },
  rowSubtitle: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    marginTop: 2,
  },
  separator: {
    marginHorizontal: 12,
  },
});
