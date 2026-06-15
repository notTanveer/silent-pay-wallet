import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const ChevronRightIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path d="M7.5 5L12.5 10L7.5 15" stroke={color} strokeWidth={1.66607} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ChevronRightIcon;
