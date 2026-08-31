interface QRSizeRatios {
  heightRatio: number;
  widthRatio: number;
}

export const computeResponsiveQRSize = (
  { height, width }: { height: number; width: number },
  ratios: QRSizeRatios,
  maxQRSize: number,
  horizontalPadding: number,
): number => {
  const heightBasedSize = Math.min(height * ratios.heightRatio, maxQRSize);
  const widthBasedSize = width * ratios.widthRatio - horizontalPadding * 2;
  return Math.min(heightBasedSize, widthBasedSize);
};
