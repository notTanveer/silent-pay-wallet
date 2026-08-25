interface QRSizeRatios {
  heightRatio: number;
  widthRatio: number;
  /** Subtract horizontalPadding*2 from the width-based candidate. Defaults to true. */
  subtractPadding?: boolean;
}

export const computeResponsiveQRSize = (
  { height, width }: { height: number; width: number },
  ratios: QRSizeRatios,
  maxQRSize: number,
  horizontalPadding: number,
): number => {
  const heightBasedSize = Math.min(height * ratios.heightRatio, maxQRSize);
  const widthBasedSize = ratios.subtractPadding === false ? width * ratios.widthRatio : width * ratios.widthRatio - horizontalPadding * 2;
  return Math.min(heightBasedSize, widthBasedSize);
};
