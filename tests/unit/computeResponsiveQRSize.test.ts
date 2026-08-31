import { computeResponsiveQRSize } from '../../helpers/computeResponsiveQRSize';

describe('computeResponsiveQRSize', () => {
  it('returns the height-based size when it is the smaller candidate', () => {
    const result = computeResponsiveQRSize({ height: 400, width: 400 }, { heightRatio: 0.6, widthRatio: 0.85 }, 500, 24);
    expect(result).toBe(240);
  });

  it('returns the width-based size when it is the smaller candidate', () => {
    const result = computeResponsiveQRSize({ height: 2000, width: 100 }, { heightRatio: 0.6, widthRatio: 0.85 }, 500, 24);
    expect(result).toBe(37);
  });

  it('caps the size at maxQRSize when both candidates exceed it', () => {
    const result = computeResponsiveQRSize({ height: 2000, width: 2000 }, { heightRatio: 0.6, widthRatio: 0.85 }, 500, 24);
    expect(result).toBe(500);
  });

  it('subtracts horizontalPadding*2 from the width candidate by default', () => {
    const result = computeResponsiveQRSize({ height: 1000, width: 800 }, { heightRatio: 0.6, widthRatio: 0.35 }, 400, 20);
    expect(result).toBe(240);
  });

  it('skips the padding subtraction when horizontalPadding is 0', () => {
    const result = computeResponsiveQRSize({ height: 1000, width: 800 }, { heightRatio: 0.6, widthRatio: 0.35 }, 400, 0);
    expect(result).toBe(280);
  });
});
