import { useSizeClass as useSizeClassOriginal, SizeClass } from '../modules/sizeClass';
import type { SizeClassInfo } from '../modules/sizeClass';

export { SizeClass };
export type { SizeClassInfo };

export const useSizeClass = useSizeClassOriginal;

export const useIsLargeScreen = useSizeClassOriginal;
