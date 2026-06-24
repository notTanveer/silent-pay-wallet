import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const PayArrowIcon: React.FC<IconProps> = ({ color = 'white', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 29 29" fill="none">
    <Path d="M10.0139 10.0138H18.2605V18.2605" stroke={color} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M10.0141 18.2604L18.2607 10.0138" stroke={color} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default PayArrowIcon;
