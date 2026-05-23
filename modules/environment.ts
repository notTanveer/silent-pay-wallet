import { getDeviceType, isTablet as checkIsTablet } from 'react-native-device-info';

const isTablet: boolean = checkIsTablet();
const isDesktop: boolean = getDeviceType() === 'Desktop';

export { isDesktop, isTablet };
