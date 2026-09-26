import DeviceInfo from 'react-native-device-info';
import loc from '../loc';

export const getAppVersionLabel = (): string =>
  loc.formatString(loc.settings.about_version_value, { version: DeviceInfo.getVersion(), build: DeviceInfo.getBuildNumber() });
