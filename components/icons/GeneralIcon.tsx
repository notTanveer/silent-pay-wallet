import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const GeneralIcon: React.FC<IconProps> = ({ size = 24, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18Z"
      stroke={color}
    />
    <Path d="M12 2V3M12 21V22M22 12H21M3 12H2" stroke={color} strokeLinecap="round" />
    <Path
      opacity={0.5}
      d="M19.0702 4.92996L18.6782 5.32296M5.3222 18.678L4.9292 19.071M19.0702 19.07L18.6782 18.677M5.3222 5.32196L4.9292 4.92896"
      stroke={color}
      strokeLinecap="round"
    />
  </Svg>
);

export default GeneralIcon;
