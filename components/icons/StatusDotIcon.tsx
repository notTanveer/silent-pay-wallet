import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { IconProps } from './types';

const StatusDotIcon: React.FC<IconProps> = ({ size = 22, color = '#2ECC71' }) => {
  const radius = size / 2;
  const innerRadius = radius * 0.36;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <Circle cx={radius} cy={radius} r={radius} fill={color} opacity={0.2} />
      <Circle cx={radius} cy={radius} r={innerRadius} fill={color} />
    </Svg>
  );
};

export default StatusDotIcon;
