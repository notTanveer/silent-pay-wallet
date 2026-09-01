interface ResponsiveQRSizeOptions {
  heightRatio?: number;
  widthRatio: number;
  maxSize: number;
  horizontalPadding?: number;
}

export const computeResponsiveQRSize = (
  { height, width }: { height: number; width: number },
  { heightRatio, widthRatio, maxSize, horizontalPadding = 0 }: ResponsiveQRSizeOptions,
): number => {
  const widthBasedSize = width * widthRatio - horizontalPadding * 2;
  // maxSize is only applied to the height-based candidate directly below, but the result stays
  // bounded either way: the final Math.min can only pick this candidate or something smaller.
  if (heightRatio === undefined) return Math.max(0, Math.min(widthBasedSize, maxSize));
  const heightBasedSize = Math.min(height * heightRatio, maxSize);
  return Math.max(0, Math.min(heightBasedSize, widthBasedSize));
};
