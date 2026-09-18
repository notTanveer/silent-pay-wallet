import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { IconProps } from './types';

interface NotFoundTileIconProps extends IconProps {
  haloBackground: string;
  cardBackground: string;
  accentColor: string;
}

const NotFoundTileIcon: React.FC<NotFoundTileIconProps> = ({ size = 80, haloBackground, cardBackground, accentColor }) => (
  <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
    <Rect width={80} height={80} rx={22} fill={haloBackground} />
    <Rect x={15} y={15} width={50} height={50} rx={13} fill={cardBackground} stroke={accentColor} strokeWidth={2} strokeDasharray="6 5" />
    <Rect x={30} y={38.75} width={20} height={2.5} rx={1.25} fill={accentColor} />
  </Svg>
);

export default NotFoundTileIcon;
