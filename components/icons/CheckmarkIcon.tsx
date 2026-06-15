import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const CheckmarkIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12L10 17L19 8" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default CheckmarkIcon;
