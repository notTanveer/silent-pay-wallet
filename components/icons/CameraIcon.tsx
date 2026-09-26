import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { IconProps } from './types';
import { useTheme } from '../themes';

const CameraIcon: React.FC<IconProps> = ({ color, size = 24 }) => {
  const { colors } = useTheme();
  const stroke = color ?? colors.brandPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3} stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export default CameraIcon;
