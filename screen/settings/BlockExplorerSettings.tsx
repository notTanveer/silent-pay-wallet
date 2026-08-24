import React from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';
import SettingsRowWrapper from '../../components/SettingsRowWrapper';
import SettingsCard from '../../components/SettingsCard';
import CheckmarkIcon from '../../components/icons/CheckmarkIcon';
import { useTheme } from '../../components/themes';
import { useSettings } from '../../hooks/context/useSettings';
import { BlockExplorer, getBlockExplorersList, normalizeUrl } from '../../models/blockExplorer';
import triggerHapticFeedback, { HapticFeedbackTypes } from '../../modules/hapticFeedback';
import { ClashFont } from '../../constants/fonts';

interface ExplorerRowProps {
  explorer: BlockExplorer;
  selected: boolean;
  onPress: () => void;
  showSeparator?: boolean;
  testID?: string;
}

const ExplorerRow: React.FC<ExplorerRowProps> = ({ explorer, selected, onPress, showSeparator = true, testID }) => {
  const { colors } = useTheme();
  return (
    <SettingsRowWrapper showSeparator={showSeparator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={explorer.name}
        accessibilityState={{ selected }}
        style={({ pressed }) => [styles.row, pressed && Platform.OS !== 'android' && styles.rowPressed]}
        onPress={onPress}
        testID={testID}
        android_ripple={{ color: colors.settingsRipple }}
      >
        <Text style={[styles.rowTitle, { color: colors.settingsRowTitle }]}>{explorer.name}</Text>
        {selected && <CheckmarkIcon color={colors.settingsCheckmark} size={20} />}
      </Pressable>
    </SettingsRowWrapper>
  );
};

const BlockExplorerSettings: React.FC = () => {
  const { selectedBlockExplorer, setBlockExplorerStorage } = useSettings();
  const explorers = getBlockExplorersList();

  const handlePress = async (explorer: BlockExplorer) => {
    if (normalizeUrl(explorer.url) === normalizeUrl(selectedBlockExplorer.url)) return;
    const success = await setBlockExplorerStorage(explorer);
    if (success) triggerHapticFeedback(HapticFeedbackTypes.NotificationSuccess);
  };

  return (
    <SafeAreaScrollView contentContainerStyle={styles.content} testID="BlockExplorerSettingsScrollView">
      <SettingsCard>
        {explorers.map((explorer, index) => (
          <ExplorerRow
            key={explorer.key}
            explorer={explorer}
            selected={normalizeUrl(explorer.url) === normalizeUrl(selectedBlockExplorer.url)}
            onPress={() => handlePress(explorer)}
            showSeparator={index < explorers.length - 1}
            testID={`BlockExplorerOption-${explorer.key}`}
          />
        ))}
      </SettingsCard>
    </SafeAreaScrollView>
  );
};

export default BlockExplorerSettings;

const styles = StyleSheet.create({
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    fontFamily: ClashFont.medium,
  },
});
