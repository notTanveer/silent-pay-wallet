import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { IconProps } from './types';

// lucide "users-round" glyph (24x24). ContactsGroupIcon carries the same glyph pre-scaled
// into a 94pt halo for the empty state; this is the bare icon.
const UsersRoundIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 21a8 8 0 0 0-16 0" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx={10} cy={8} r={5} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default UsersRoundIcon;
