import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { IconProps } from './types';
import { useTheme } from '../themes';

const StatusDotIcon: React.FC<IconProps> = ({ size = 22, color }) => {
  const { colors } = useTheme();
  const dot = color ?? colors.statusSuccess;
  const radius = size / 2;
  const innerRadius = radius * 0.36;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <Circle cx={radius} cy={radius} r={radius} fill={dot} opacity={0.2} />
      <Circle cx={radius} cy={radius} r={innerRadius} fill={dot} />
    </Svg>
  );
};

export default StatusDotIcon;
