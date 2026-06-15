import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const SendIcon: React.FC<IconProps> = ({ color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M4.16516 9.99655L9.99642 4.16528L15.8277 9.99655"
      stroke={color}
      strokeWidth={1.66607}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M9.99646 15.8278V4.16528" stroke={color} strokeWidth={1.66607} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default SendIcon;
