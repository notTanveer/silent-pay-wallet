import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { IconProps } from './types';

const ClipboardIcon: React.FC<IconProps> = ({ color = '#754CE8', size = 14 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={4} width={14} height={17} rx={2} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Rect x={9} y={2} width={6} height={4} rx={1.5} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ClipboardIcon;
