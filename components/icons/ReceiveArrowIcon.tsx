import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const ReceiveArrowIcon: React.FC<IconProps> = ({ color = '#754CE8', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 29 29" fill="none">
    <Path d="M18.2607 10.0138L10.0141 18.2604" stroke={color} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18.2603 18.2604H10.0137V10.0138" stroke={color} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ReceiveArrowIcon;
