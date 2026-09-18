import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { IconProps } from './types';

interface CheckBadgeIconProps extends IconProps {
  color: string;
  checkColor?: string;
  showHalo?: boolean;
  haloBackground?: string;
  haloBorder?: string;
}

// No drop shadow: FeMorphology isn't implemented in react-native-svg@15.12.1 and warns + renders null.
const CheckBadgeIcon: React.FC<CheckBadgeIconProps> = ({
  size = 92,
  color,
  checkColor = '#FFFFFF',
  showHalo = false,
  haloBackground = '#FDFCFE',
  haloBorder = '#E6E4E4',
}) => {
  if (showHalo) {
    return (
      <Svg width={size} height={size} viewBox="0 0 98 98" fill="none">
        <Path
          d="M0 16C0 7.16342 7.16344 0 16 0H81.9999C90.8365 0 97.9999 7.16344 97.9999 16V81.9999C97.9999 90.8365 90.8364 97.9999 81.9999 97.9999H16C7.16342 97.9999 0 90.8364 0 81.9999V16Z"
          fill={haloBackground}
        />
        <Path
          d="M16 0.5H82C90.5604 0.500045 97.5 7.43961 97.5 16V82C97.5 90.5603 90.5603 97.4999 82 97.5H16C7.43962 97.5 0.500058 90.5604 0.5 82V16C0.5 7.43959 7.43959 0.5 16 0.5Z"
          stroke={haloBorder}
          strokeOpacity={0.6}
        />
        <Path
          d="M16.3335 32.3333C16.3335 23.4968 23.4969 16.3333 32.3335 16.3333H65.6668C74.5033 16.3333 81.6668 23.4968 81.6668 32.3333V65.6666C81.6668 74.5031 74.5033 81.6666 65.6668 81.6666H32.3335C23.4969 81.6666 16.3335 74.5031 16.3335 65.6666V32.3333Z"
          fill={color}
        />
        <Path
          d="M32.3335 16.8333H65.6665C74.2269 16.8333 81.1665 23.7729 81.1665 32.3333V65.6663C81.1665 74.2267 74.2269 81.1663 65.6665 81.1663H32.3335C23.7731 81.1663 16.8335 74.2267 16.8335 65.6663V32.3333C16.8335 23.7729 23.7731 16.8333 32.3335 16.8333Z"
          stroke={color}
        />
        <Path
          d="M59.6671 40.9999L45.0004 55.6666L38.3337 48.9999"
          stroke={checkColor}
          strokeWidth={1.67}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 92 92" fill="none">
      <Path
        d="M13 19C13 10.1634 20.1634 3 29 3H62.3333C71.1698 3 78.3333 10.1634 78.3333 19V52.3333C78.3333 61.1698 71.1698 68.3333 62.3333 68.3333H29C20.1634 68.3333 13 61.1698 13 52.3333V19Z"
        fill={color}
      />
      <Path
        d="M29 3.5H62.333C70.8934 3.5 77.833 10.4396 77.833 19V52.333C77.833 60.8934 70.8934 67.833 62.333 67.833H29C20.4396 67.833 13.5 60.8934 13.5 52.333V19C13.5 10.4396 20.4396 3.5 29 3.5Z"
        stroke={color}
      />
      <Path
        d="M56.3336 27.6666L41.6669 42.3333L35.0002 35.6666"
        stroke={checkColor}
        strokeWidth={1.67}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default CheckBadgeIcon;
