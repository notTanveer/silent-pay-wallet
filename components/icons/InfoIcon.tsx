import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const InfoIcon: React.FC<IconProps> = ({ color = '#754CE8', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <Path
      d="M9.99639 18.3268C14.5971 18.3268 18.3268 14.5971 18.3268 9.99639C18.3268 5.39565 14.5971 1.66602 9.99639 1.66602C5.39565 1.66602 1.66602 5.39565 1.66602 9.99639C1.66602 14.5971 5.39565 18.3268 9.99639 18.3268Z"
      stroke={color}
      strokeWidth={1.66607}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M9.99634 13.3286V9.99646" stroke={color} strokeWidth={1.66607} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9.99634 6.66431H10.0047" stroke={color} strokeWidth={1.66607} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default InfoIcon;
