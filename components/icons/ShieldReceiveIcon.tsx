import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ShieldReceiveIconProps {
  size?: number;
  background?: string;
  borderColor?: string;
  accent?: string;
}

const ShieldReceiveIcon: React.FC<ShieldReceiveIconProps> = ({
  size = 94,
  background = '#FAF5FF',
  borderColor = '#F3E8FF',
  accent = '#754CE8',
}) => (
  <Svg width={size} height={size} viewBox="0 0 94 94" fill="none">
    <Path
      d="M45.5771 0.5C70.4727 0.5 90.655 20.6817 90.6553 45.5771C90.6553 70.4728 70.4728 90.6553 45.5771 90.6553C20.6817 90.655 0.5 70.4727 0.5 45.5771C0.500252 20.6818 20.6818 0.500252 45.5771 0.5Z"
      fill={background}
    />
    <Path
      d="M45.5771 0.5C70.4727 0.5 90.655 20.6817 90.6553 45.5771C90.6553 70.4728 70.4728 90.6553 45.5771 90.6553C20.6817 90.655 0.5 70.4727 0.5 45.5771C0.500252 20.6818 20.6818 0.500252 45.5771 0.5Z"
      stroke={borderColor}
    />
    <Path
      d="M60.7693 47.4765C60.7693 56.9712 54.123 61.7186 46.2234 64.4721C45.8098 64.6122 45.3604 64.6055 44.9511 64.4531C37.0325 61.7186 30.3862 56.9712 30.3862 47.4765V34.1839C30.3862 33.6803 30.5863 33.1973 30.9424 32.8412C31.2985 32.485 31.7815 32.285 32.2852 32.285C36.0831 32.285 40.8304 30.0062 44.1346 27.1198C44.5369 26.7761 45.0486 26.5873 45.5778 26.5873C46.1069 26.5873 46.6187 26.7761 47.021 27.1198C50.3441 30.0252 55.0725 32.285 58.8704 32.285C59.374 32.285 59.857 32.485 60.2131 32.8412C60.5693 33.1973 60.7693 33.6803 60.7693 34.1839V47.4765Z"
      stroke={accent}
      strokeWidth="3.79789"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M59.8193 76.9106C59.8193 67.4713 67.4713 59.8193 76.9106 59.8193C86.3498 59.8193 94.0018 67.4713 94.0018 76.9106C94.0018 86.3498 86.3498 94.0018 76.9106 94.0018C67.4713 94.0018 59.8193 86.3498 59.8193 76.9106Z"
      fill={accent}
    />
    <Path d="M76.9111 71.9257V81.8955" stroke="white" strokeWidth="1.42427" strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M81.8957 76.9106L76.9107 81.8956L71.9258 76.9106"
      stroke="white"
      strokeWidth="1.42427"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ShieldReceiveIcon;
