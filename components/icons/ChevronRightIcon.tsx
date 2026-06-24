import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { IconProps } from './types';

const ChevronRightIcon: React.FC<IconProps> = ({ size = 20, color = '#9AA0AA' }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M7.49756 14.9946L12.4958 9.99639L7.49756 4.99817"
      stroke={color}
      strokeWidth={1.66607}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ChevronRightIcon;
