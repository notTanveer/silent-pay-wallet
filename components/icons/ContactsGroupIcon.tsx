import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ContactsGroupIconProps {
  size?: number;
  background?: string;
  borderColor?: string;
  accent?: string;
}

// lucide "users-round" glyph (24x24) scaled 1.875x and centered in the 94x94 halo,
// matching the Figma frame's icon inset (8.33%/12.5%) exactly.
const ContactsGroupIcon: React.FC<ContactsGroupIconProps> = ({
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
    <Path d="M58.25 63.875a15 15 0 0 0-30 0" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M52.625 39.5a9.375 9.375 0 1 1-18.75 0 9.375 9.375 0 0 1 18.75 0Z"
      stroke={accent}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M65.75 62c0-6.31875-3.75-12.1875-7.5-15a9.375 9.375 0 0 0-.84375-15.5625"
      stroke={accent}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M59.8193 76.9106C59.8193 67.4713 67.4713 59.8193 76.9106 59.8193C86.3498 59.8193 94.0018 67.4713 94.0018 76.9106C94.0018 86.3498 86.3498 94.0018 76.9106 94.0018C67.4713 94.0018 59.8193 86.3498 59.8193 76.9106Z"
      fill={accent}
    />
    <Path d="M76.9111 71.9257V81.8955" stroke="white" strokeWidth={1.42427} strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M71.9258 76.9106L76.9106 81.8955L81.8955 76.9106"
      stroke="white"
      strokeWidth={1.42427}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export default ContactsGroupIcon;
