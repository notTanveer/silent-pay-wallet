import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const ChevronUpIcon: React.FC<IconProps> = ({ size = 20, color = '#9AA0AA' }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M14.9945 12.4956L9.99627 7.49738L4.99805 12.4956"
      stroke={color}
      strokeWidth={1.66607}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ChevronUpIcon;
