import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

const ClockIcon: React.FC<IconProps> = ({ color, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} />
    <Path d="M12 7 V12 L15.5 14" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default ClockIcon;
