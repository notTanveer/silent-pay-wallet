import { computeResponsiveQRSize } from '../../helpers/computeResponsiveQRSize';

describe('computeResponsiveQRSize', () => {
  it('returns the height-based size when it is the smaller candidate', () => {
    const result = computeResponsiveQRSize(
      { height: 400, width: 400 },
      { heightRatio: 0.6, widthRatio: 0.85, maxSize: 500, horizontalPadding: 24 },
    );
    expect(result).toBe(240);
  });

  it('returns the width-based size when it is the smaller candidate', () => {
    const result = computeResponsiveQRSize(
      { height: 2000, width: 100 },
      { heightRatio: 0.6, widthRatio: 0.85, maxSize: 500, horizontalPadding: 24 },
    );
    expect(result).toBe(37);
  });

  it('caps the size at maxSize when both candidates exceed it', () => {
    const result = computeResponsiveQRSize(
      { height: 2000, width: 2000 },
      { heightRatio: 0.6, widthRatio: 0.85, maxSize: 500, horizontalPadding: 24 },
    );
    expect(result).toBe(500);
  });

  it('subtracts horizontalPadding*2 from the width candidate when provided', () => {
    const result = computeResponsiveQRSize(
      { height: 1000, width: 800 },
      { heightRatio: 0.6, widthRatio: 0.35, maxSize: 400, horizontalPadding: 20 },
    );
    expect(result).toBe(240);
  });

  it('defaults horizontalPadding to 0 when omitted', () => {
    const result = computeResponsiveQRSize({ height: 1000, width: 800 }, { heightRatio: 0.6, widthRatio: 0.35, maxSize: 400 });
    expect(result).toBe(280);
  });

  it('ignores height and returns the width-based size when heightRatio is omitted', () => {
    // height: 1 would dominate if it were used (any heightRatio > 0 gives a near-zero
    // heightBasedSize) — the result being the full width-based size proves it's skipped.
    const result = computeResponsiveQRSize({ height: 1, width: 100 }, { widthRatio: 1, maxSize: 370, horizontalPadding: 10 });
    expect(result).toBe(80);
  });

  it('still caps at maxSize when heightRatio is omitted and the width candidate exceeds it', () => {
    const result = computeResponsiveQRSize({ height: 1, width: 800 }, { widthRatio: 1, maxSize: 370, horizontalPadding: 20 });
    expect(result).toBe(370);
  });

  it('matches DynamicQRCode portrait and landscape sizing', () => {
    const portrait = computeResponsiveQRSize({ height: 800, width: 400 }, { widthRatio: 1, maxSize: 370, horizontalPadding: 20 });
    expect(portrait).toBe(Math.min(400 - 40, 370));

    const landscape = computeResponsiveQRSize({ height: 400, width: 800 }, { widthRatio: 1 / 3, maxSize: 370 });
    expect(landscape).toBeCloseTo(Math.min(800 / 3, 370));
  });

  it('clamps to 0 instead of going negative when the container is narrower than the padding', () => {
    const result = computeResponsiveQRSize(
      { height: 1000, width: 50 },
      { heightRatio: 1, widthRatio: 1, maxSize: 500, horizontalPadding: 30 },
    );
    expect(result).toBe(0);
  });

  it('clamps to 0 when heightRatio is omitted and the container is narrower than the padding', () => {
    const result = computeResponsiveQRSize({ height: 1, width: 50 }, { widthRatio: 1, maxSize: 500, horizontalPadding: 30 });
    expect(result).toBe(0);
  });
});
