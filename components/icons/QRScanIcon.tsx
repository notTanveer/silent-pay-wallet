import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const QRScanIcon: React.FC<IconProps> = ({ color = '#754CE8', size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 3H4C3.44772 3 3 3.44772 3 4V7C3 7.55228 3.44772 8 4 8H7C7.55228 8 8 7.55228 8 7V4C8 3.44772 7.55228 3 7 3Z"
      stroke={color}
      strokeWidth="1.99985"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M19.999 2.99976H16.999C16.4467 2.99976 15.999 3.44747 15.999 3.99976V6.99976C15.999 7.55204 16.4467 7.99976 16.999 7.99976H19.999C20.5513 7.99976 20.999 7.55204 20.999 6.99976V3.99976C20.999 3.44747 20.5513 2.99976 19.999 2.99976Z"
      stroke={color}
      strokeWidth="1.99985"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M7 15.9988H4C3.44772 15.9988 3 16.4465 3 16.9988V19.9988C3 20.5511 3.44772 20.9988 4 20.9988H7C7.55228 20.9988 8 20.5511 8 19.9988V16.9988C8 16.4465 7.55228 15.9988 7 15.9988Z"
      stroke={color}
      strokeWidth="1.99985"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M20.999 15.9988H17.999C17.4686 15.9988 16.9599 16.2095 16.5848 16.5846C16.2097 16.9596 15.999 17.4683 15.999 17.9988V20.9988"
      stroke={color}
      strokeWidth="1.99985"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M20.9985 20.9984V21.0084" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M11.9995 6.99951V9.99951C11.9995 10.5299 11.7888 11.0387 11.4137 11.4137C11.0387 11.7888 10.5299 11.9995 9.99951 11.9995H6.99951"
      stroke={color}
      strokeWidth="1.99985"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M3 11.9991H3.01" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M11.999 2.99976H12.009" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M11.999 15.9988V16.0088" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M15.999 11.9991H16.999" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20.9985 11.9991V12.0091" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M11.999 20.9985V19.9985" stroke={color} strokeWidth="1.99985" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default QRScanIcon;
