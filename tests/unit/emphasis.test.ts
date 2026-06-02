import { splitForEmphasis } from '../../helpers/emphasis';

describe('splitForEmphasis', () => {
  it('splits around the first occurrence of the emphasis substring', () => {
    expect(splitForEmphasis('share without compromising privacy', 'without compromising privacy')).toEqual([
      'share ',
      'without compromising privacy',
      '',
    ]);
  });

  it('returns the whole string as "before" when emphasis is missing', () => {
    expect(splitForEmphasis('hello world', 'xyz')).toEqual(['hello world', '', '']);
  });

  it('returns the whole string as "before" when emphasis is undefined', () => {
    expect(splitForEmphasis('hello world')).toEqual(['hello world', '', '']);
  });

  it('splits in the middle', () => {
    expect(splitForEmphasis('a b c', 'b')).toEqual(['a ', 'b', ' c']);
  });
});
