import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import { useTheme } from '../../components/themes';
import { useSettings } from '../../hooks/context/useSettings';
import { ThemePreference } from '../../components/Context/SettingsProvider';
import loc from '../../loc';
import { ClashFont } from '../../constants/fonts';

interface ThemeCardProps {
  variant: 'light' | 'dark';
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ variant, label, selected, onPress, testID }) => {
  const { colors } = useTheme();
  const isLight = variant === 'light';
  const barColor = isLight ? colors.themePreviewBarLight : colors.themePreviewBarDark;
  const borderColor = selected ? colors.accentColor : colors.themePreviewBorderInactive;
  const borderWidth = selected ? 2 : 1.5;
  const labelColor = selected ? colors.accentColor : colors.themePreviewLabelInactive;
  const cardStyle = {
    backgroundColor: isLight ? colors.themePreviewLightBg : colors.themePreviewDarkBg,
    borderColor,
    borderWidth,
  };
  const labelStyle = { color: labelColor };

  return (
    <Pressable onPress={onPress} style={styles.cardWrapper} testID={testID} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.card, cardStyle]}>
        <View style={[styles.bar, styles.barWide, { backgroundColor: barColor }]} />
        <View style={[styles.bar, styles.barNarrow, { backgroundColor: barColor }]} />
        <View style={[styles.pill, { backgroundColor: colors.accentColor }]} />
        {selected && (
          <View style={[styles.badge, { backgroundColor: colors.accentColor }]}>
            <CheckmarkIcon color="#FFFFFF" size={14} />
          </View>
        )}
      </View>
      <Text style={[styles.cardLabel, labelStyle]}>{label}</Text>
    </Pressable>
  );
};

const ThemeSettings: React.FC = () => {
  const { colors } = useTheme();
  const { themePreference, setThemePreferenceStorage } = useSettings();
  const systemColorScheme = useColorScheme();

  const description = useMemo(() => {
    switch (themePreference) {
      case 'light':
        return loc.settings.theme_light_description;
      case 'dark':
        return loc.settings.theme_dark_description;
      default:
        return loc.settings.theme_system_description;
    }
  }, [themePreference]);

  const selectTheme = (value: ThemePreference) => setThemePreferenceStorage(value);

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <ThemeCard
          variant="light"
          label={loc.settings.theme_light}
          selected={themePreference === 'light'}
          onPress={() => selectTheme('light')}
          testID="ThemeLightOption"
        />
        <ThemeCard
          variant="dark"
          label={loc.settings.theme_dark}
          selected={themePreference === 'dark'}
          onPress={() => selectTheme('dark')}
          testID="ThemeDarkOption"
        />
        <ThemeCard
          variant={systemColorScheme === 'dark' ? 'dark' : 'light'}
          label={loc.settings.theme_system}
          selected={themePreference === 'system'}
          onPress={() => selectTheme('system')}
          testID="ThemeSystemOption"
        />
      </View>
      <View style={[styles.descriptionBox, { backgroundColor: colors.settingsCardBackground, borderColor: colors.settingsCardBorder }]}>
        <Text style={[styles.descriptionText, { color: colors.settingsDescriptionText }]}>{description}</Text>
      </View>
    </SafeAreaScrollView>
  );
};

export default ThemeSettings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardWrapper: {
    width: 104,
  },
  card: {
    width: 104,
    height: 140,
    borderRadius: 18,
    paddingLeft: 18,
    paddingTop: 53,
    alignItems: 'flex-start',
  },
  bar: {
    height: 10,
    borderRadius: 5,
  },
  barWide: {
    width: 49,
    marginBottom: 8,
  },
  barNarrow: {
    width: 36,
    marginBottom: 12,
  },
  pill: {
    width: 36,
    height: 28,
    borderRadius: 14,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 15,
    fontFamily: ClashFont.regular,
    textAlign: 'center',
    marginTop: 8,
  },
  descriptionBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: ClashFont.regular,
    lineHeight: 23,
  },
});
