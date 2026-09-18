import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';
import { useTheme } from '../themes';

const ChevronRightIcon: React.FC<IconProps> = ({ size = 20, color }) => {
  const { colors } = useTheme();
  const stroke = color ?? colors.chevron;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M7.49756 14.9946L12.4958 9.99639L7.49756 4.99817"
        stroke={stroke}
        strokeWidth={1.66607}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default ChevronRightIcon;
