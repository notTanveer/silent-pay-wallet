/**
 * Splits `text` into [before, match, after] around the first occurrence of
 * `emphasis`. If `emphasis` is undefined or not found, returns [text, '', ''].
 * Used to bold a clause inside otherwise-regular copy.
 */
export const splitForEmphasis = (text: string, emphasis?: string): [string, string, string] => {
  if (!emphasis) return [text, '', ''];
  const index = text.indexOf(emphasis);
  if (index === -1) return [text, '', ''];
  return [text.slice(0, index), emphasis, text.slice(index + emphasis.length)];
};
