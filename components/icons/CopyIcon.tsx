import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { IconProps } from './types';

const CopyIcon: React.FC<IconProps> = ({ color = '#8E8E93', size = 16 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="9" y="9" width="13" height="13" rx="2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default CopyIcon;
