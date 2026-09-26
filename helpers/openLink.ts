import { Linking } from 'react-native';
import presentAlert from '../components/Alert';
import loc from '../loc';

// Linking.openURL rejects when no installed app can handle the URL.
export const openLink = (url: string): void => {
  Linking.openURL(url).catch(() => {
    presentAlert({ title: loc.errors.error, message: loc.errors.open_link_failed });
  });
};
