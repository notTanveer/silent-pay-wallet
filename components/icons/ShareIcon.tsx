import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ShareIconProps {
  color: string;
  size?: number;
}

const ShareIcon: React.FC<ShareIconProps> = ({ color, size = 19 }) => (
  <Svg width={size} height={size} viewBox="0 0 19 19" fill="none">
    <Path
      d="M2.96875 10.0938V14.8438C2.96875 15.1587 3.09386 15.4607 3.31656 15.6834C3.53926 15.9061 3.84131 16.0312 4.15625 16.0312H14.8438C15.1587 16.0312 15.4607 15.9061 15.6834 15.6834C15.9061 15.4607 16.0312 15.1587 16.0312 14.8438V10.0938M9.5 11.875V2.07812M13.0625 5.34375L9.5 1.78125L5.9375 5.34375"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ShareIcon;
