import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  color?: string;
  size?: number;
}

const SendIcon: React.FC<IconProps> = ({ color = '#FFFFFF', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 2 L11 13" stroke={color} strokeWidth={1.67} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 2 L15 22 L11 13 L2 9 Z" stroke={color} strokeWidth={1.67} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default SendIcon;
