import { LaunchArguments } from 'react-native-launch-arguments';

type E2ELaunchArgs = {
  detoxE2E?: boolean;
};

export const isE2E = (): boolean => {
  try {
    return LaunchArguments.value<E2ELaunchArgs>().detoxE2E === true;
  } catch {
    return false;
  }
};
