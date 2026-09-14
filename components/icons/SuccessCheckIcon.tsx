import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface SuccessCheckIconProps {
  size?: number;
}

// Fixed two-tone badge (not theme-driven) used on the restore success sheet.
const SuccessCheckIcon: React.FC<SuccessCheckIconProps> = ({ size = 60 }) => (
  <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
    <Path
      d="M0 30C0 13.4315 13.4315 0 30 0C46.5685 0 60 13.4315 60 30C60 46.5685 46.5685 60 30 60C13.4315 60 0 46.5685 0 30Z"
      fill="#1A1535"
    />
    <Path
      d="M40.6846 23.3022L26.4326 37.5542L19.3154 30.436L20.209 29.5425L26.4336 35.7671L27.0234 35.1763L39.791 22.4087L40.6846 23.3022Z"
      fill="#6B5CE7"
      stroke="#6B5CE7"
      strokeWidth={1.67}
    />
  </Svg>
);

export default SuccessCheckIcon;
