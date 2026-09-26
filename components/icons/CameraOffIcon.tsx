import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

const CameraOffIcon: React.FC<IconProps> = ({ color = '#754CE8', size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 20 21" fill="none">
    <Path
      d="M19.1673 16.8333C19.1673 17.2754 18.9917 17.6993 18.6792 18.0118C18.3666 18.3244 17.9427 18.5 17.5006 18.5H2.50065C2.05862 18.5 1.6347 18.3244 1.32214 18.0118C1.00958 17.6993 0.833984 17.2754 0.833984 16.8333V7.66667C0.833984 7.22464 1.00958 6.80072 1.32214 6.48816C1.6347 6.17559 2.05862 6 2.50065 6H5.83398L7.50065 3.5H12.5006L14.1673 6H17.5006C17.9427 6 18.3666 6.17559 18.6792 6.48816C18.9917 6.80072 19.1673 7.22464 19.1673 7.66667V16.8333Z"
      stroke={color}
      strokeWidth={1.66667}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M1.66602 2.6665L18.3327 19.3332" stroke={color} strokeWidth={1.66667} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default CameraOffIcon;
