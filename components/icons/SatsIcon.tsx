import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { IconProps } from './types';

const SatsIcon: React.FC<IconProps> = ({ size = 48, color, backgroundColor = 'white' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Rect width="47.9965" height="47.9965" rx="23.9982" fill={backgroundColor} />
    <Path
      d="M19.3564 20.2046H27.6898M23.5231 18.1588V16.113M23.5231 31.113V29.0671M19.3564 23.613H27.6898M19.3564 27.0213H27.6898"
      stroke={color}
      strokeWidth={0.833333}
    />
  </Svg>
);

export default SatsIcon;
