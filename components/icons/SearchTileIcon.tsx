import React from 'react';
import Svg, { G, Rect } from 'react-native-svg';
import { SearchGlyph } from './SearchIcon';

interface SearchTileIconProps {
  size?: number;
  haloBackground: string;
  tileBackground: string;
  glyphColor?: string;
}

const SearchTileIcon: React.FC<SearchTileIconProps> = ({ size = 80, haloBackground, tileBackground, glyphColor = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
    <Rect width={80} height={80} rx={22} fill={haloBackground} />
    <Rect x={14} y={14} width={52} height={52} rx={15} fill={tileBackground} />
    <G transform="translate(14 14) scale(1.08333)">
      <SearchGlyph stroke={glyphColor} />
    </G>
  </Svg>
);

export default SearchTileIcon;
