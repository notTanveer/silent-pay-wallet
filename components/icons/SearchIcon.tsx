import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface SearchIconProps {
  size?: number;
  background?: string;
  stroke?: string;
}

const SearchIcon: React.FC<SearchIconProps> = ({ size = 48, background = '#ffffff', stroke = '#754CE8' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <Rect width="47.9965" height="47.9965" rx="23.9982" fill={background} />
    <Path
      d="M23.1609 29.8295C26.8415 29.8295 29.8252 26.8457 29.8252 23.1652C29.8252 19.4846 26.8415 16.5009 23.1609 16.5009C19.4803 16.5009 16.4966 19.4846 16.4966 23.1652C16.4966 26.8457 19.4803 29.8295 23.1609 29.8295Z"
      stroke={stroke}
      strokeWidth="1.66607"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M31.4912 31.4955L27.9092 27.9135" stroke={stroke} strokeWidth="1.66607" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default SearchIcon;
