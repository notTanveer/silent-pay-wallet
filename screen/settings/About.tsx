import React from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { BlueCard } from '../../BlueComponents';
import ListItem from '../../components/ListItem';
import { useTheme } from '../../components/themes';
import loc, { formatStringAddTwoWhiteSpaces } from '../../loc';
import { useExtendedNavigation } from '../../hooks/useExtendedNavigation';
import SafeAreaScrollView from '../../components/SafeAreaScrollView';


const About: React.FC = () => {
  const { navigate } = useExtendedNavigation();
  const { colors } = useTheme();

  const stylesHook = StyleSheet.create({
    textBackup: {
      color: colors.foregroundColor,
    },
    buildWith: {
      backgroundColor: colors.inputBackgroundColor,
    },
    buttonLink: {
      backgroundColor: colors.lightButton,
    },
    textLink: {
      color: colors.foregroundColor,
    },
  });

  const handleOnLicensingPress = () => {
    navigate('Licensing');
  };

  const handleOnDiscordPress = () => {
    Linking.openURL('https://discord.com/invite/STeQFVEWf9');
  };

  const handleOnGithubPress = () => {
    Linking.openURL('https://github.com/Bitshala-Incubator/silent-pay-wallet');
  };

  return (
    <SafeAreaScrollView testID="AboutScrollView" contentInsetAdjustmentBehavior="automatic" automaticallyAdjustContentInsets>
      <BlueCard>
        <View style={styles.center}>
          <Image style={styles.logo} source={require('../../img/icon.png')} />
          <Text style={styles.textFree}>{loc.settings.about_free}</Text>
          <Text style={[styles.textBackup, stylesHook.textBackup]}>{formatStringAddTwoWhiteSpaces(loc.settings.warning)}</Text>
        </View>
        <ListItem
          leftIcon={{
            name: 'discord',
            type: 'font-awesome-5',
            color: '#7289da',
          }}
          onPress={handleOnDiscordPress}
          title={loc.settings.about_sm_discord}
        />
        <ListItem
          leftIcon={{
            name: 'github',
            type: 'font-awesome-5',
            color: '#000000',
          }}
          onPress={handleOnGithubPress}
          title={loc.settings.about_sm_github}
        />
      </BlueCard>
    </SafeAreaScrollView>
  );
};

export default About;

const styles = StyleSheet.create({
  copyToClipboard: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyToClipboardText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#68bbe1',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 54,
  },
  logo: {
    width: 102,
    height: 124,
  },
  textFree: {
    maxWidth: 260,
    marginVertical: 24,
    color: '#9AA0AA',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  textBackup: {
    maxWidth: 260,
    marginBottom: 40,
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  buildWith: {
    padding: 16,
    paddingTop: 0,
    borderRadius: 8,
  },
  buttonLink: {
    borderRadius: 12,
    justifyContent: 'center',
    padding: 8,
    flexDirection: 'row',
  },
  textLink: {
    marginLeft: 8,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
