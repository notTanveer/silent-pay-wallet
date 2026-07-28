import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const AboutIcon: React.FC<IconProps> = ({ size = 24, color }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M11.9993 21.9985C17.5217 21.9985 21.9985 17.5217 21.9985 11.9993C21.9985 6.47682 17.5217 2 11.9993 2C6.47682 2 2 6.47682 2 11.9993C2 17.5217 6.47682 21.9985 11.9993 21.9985Z"
      stroke={color}
      strokeWidth={1.99985}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9.08936 8.99947C9.32446 8.33114 9.78851 7.76758 10.3993 7.4086C11.0101 7.04963 11.7283 6.91841 12.4265 7.03818C13.1248 7.15796 13.7582 7.521 14.2144 8.063C14.6707 8.605 14.9204 9.29099 14.9194 9.99947C14.9194 11.9995 11.9194 12.9995 11.9194 12.9995"
      stroke={color}
      strokeWidth={1.99985}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M11.999 16.9988H12.009" stroke={color} strokeWidth={1.99985} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default AboutIcon;
