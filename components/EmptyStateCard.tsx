import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from './themes';
import { ClashFont } from '../constants/fonts';

interface EmptyStateCardProps {
  // Haloed 94x94 glyph — ShieldReceiveIcon for transactions, ContactsGroupIcon for contacts.
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  // The call to action that gets the user out of the empty state.
  children?: React.ReactNode;
  testID?: string;
  standalone?: boolean;
}

// The one empty state in the app: every list that can be empty fills its space with this card,
// so "no transactions" and "no contacts" differ only in glyph, copy and action.
const EmptyStateCard: React.FC<EmptyStateCardProps> = ({ icon, title, subtitle, children, testID, standalone = false }) => {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        !standalone && [styles.bordered, { backgroundColor: colors.cardBackground, borderColor: colors.lightBorder }],
        standalone && styles.raised,
      ]}
      testID={testID}
    >
      <View style={styles.icon}>{icon}</View>
      <Text style={[styles.title, { color: colors.emptyStateTitle }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.amountMeta }]}>{subtitle}</Text>
      {children}
    </View>
  );
};

export default EmptyStateCard;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bordered: { borderWidth: 1 },
  raised: { transform: [{ translateY: -96 }] },
  icon: { marginBottom: 28 },
  title: {
    fontFamily: ClashFont.medium,
    fontSize: 20,
    lineHeight: 32,
    letterSpacing: 0.07,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: ClashFont.regular,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.31,
    textAlign: 'center',
    marginBottom: 28,
  },
});
