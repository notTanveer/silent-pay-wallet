import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { TransactionIconProps } from './getTransactionIconColors';

const TransactionDirectionIcon: React.FC<TransactionIconProps> = ({
  size = 44,
  haloBackground,
  haloBorder,
  background,
  borderColor,
  arrowColor,
  direction,
}) => (
  <Svg width={size} height={size} viewBox="12 17 44 44" fill="none">
    <Circle cx="33.8991" cy="39" r="21.3991" fill={haloBackground} stroke={haloBorder} />
    <Rect
      x="47.5"
      y="52.601"
      width="27.6274"
      height="27.6274"
      rx="13.8137"
      transform="rotate(180 47.5 52.601)"
      fill={background}
      stroke={borderColor}
    />
    {direction === 'incoming' ? (
      <>
        <Path
          d="M30.0329 36.7178C30.1225 36.8073 30.179 36.9299 30.179 37.0713L30.179 42.2945L35.4022 42.2945C35.6756 42.2945 35.9019 42.5208 35.9019 42.7942C35.9019 43.0676 35.6756 43.2939 35.4022 43.2939L29.6793 43.2939C29.4059 43.2939 29.1797 43.0676 29.1797 42.7942L29.1797 37.0713C29.1797 36.7979 29.4059 36.5716 29.6793 36.5716C29.8161 36.5669 29.9433 36.6282 30.0329 36.7178Z"
          fill={arrowColor}
        />
        <Path
          d="M38.0468 34.4267C38.2401 34.62 38.2401 34.9406 38.0468 35.1339L30.1131 43.0676C29.9198 43.2609 29.5992 43.2609 29.406 43.0676C29.2127 42.8743 29.2127 42.5538 29.406 42.3605L37.3397 34.4267C37.533 34.2335 37.8535 34.2335 38.0468 34.4267Z"
          fill={arrowColor}
        />
      </>
    ) : (
      <G transform="translate(0, 1)">
        <Path
          d="M37.3397 39.8567C37.2501 39.7671 37.1935 39.6446 37.1935 39.5031L37.1935 34.28L31.9704 34.28C31.6969 34.28 31.4707 34.0537 31.4707 33.7803C31.4707 33.5069 31.6969 33.2806 31.9704 33.2806L37.6932 33.2806C37.9666 33.2806 38.1929 33.5069 38.1929 33.7803L38.1929 39.5031C38.1929 39.7766 37.9666 40.0028 37.6932 40.0028C37.5565 40.0075 37.4292 39.9463 37.3397 39.8567Z"
          fill={arrowColor}
        />
        <Path
          d="M29.3257 42.1477C29.1325 41.9544 29.1325 41.6339 29.3257 41.4406L37.2595 33.5069C37.4528 33.3136 37.7733 33.3136 37.9666 33.5069C38.1599 33.7001 38.1599 34.0207 37.9666 34.214L30.0329 42.1477C29.8396 42.341 29.519 42.341 29.3257 42.1477Z"
          fill={arrowColor}
        />
      </G>
    )}
  </Svg>
);

export default TransactionDirectionIcon;
