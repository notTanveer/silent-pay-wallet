import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const LightningIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2 L5 13 H11 L11 22 L19 10 H13 Z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default LightningIcon;
