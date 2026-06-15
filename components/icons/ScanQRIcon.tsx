import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const ScanQRIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M2.49902 5.8313V4.16522C2.49902 3.72335 2.67456 3.29958 2.98701 2.98713C3.29946 2.67468 3.72323 2.49915 4.1651 2.49915H5.83117"
      stroke={color}
      strokeWidth="1.66607"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M14.1616 2.49915H15.8277C16.2696 2.49915 16.6933 2.67468 17.0058 2.98713C17.3182 3.29958 17.4938 3.72335 17.4938 4.16522V5.8313"
      stroke={color}
      strokeWidth="1.66607"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M17.4938 14.1616V15.8277C17.4938 16.2696 17.3182 16.6933 17.0058 17.0058C16.6933 17.3182 16.2696 17.4938 15.8277 17.4938H14.1616"
      stroke={color}
      strokeWidth="1.66607"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M5.83117 17.4938H4.1651C3.72323 17.4938 3.29946 17.3182 2.98701 17.0058C2.67456 16.6933 2.49902 16.2696 2.49902 15.8277V14.1616"
      stroke={color}
      strokeWidth="1.66607"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M5.83105 9.99646H14.1614" stroke={color} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ScanQRIcon;
