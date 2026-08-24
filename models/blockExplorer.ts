import DefaultPreference from 'react-native-default-preference';
import { GROUP_IO_SHROUD } from '../modules/currency';

export interface BlockExplorer {
  key: string;
  name: string;
  url: string;
}

export const BLOCK_EXPLORERS = {
  default: { key: 'default', name: 'Mempool.space', url: 'https://mempool.space' },
  blockchair: { key: 'blockchair', name: 'Blockchair', url: 'https://blockchair.com/bitcoin' },
  blockstream: { key: 'blockstream', name: 'Blockstream.info', url: 'https://blockstream.info' },
} as const satisfies Record<string, BlockExplorer>;

export const getBlockExplorersList = (): BlockExplorer[] => Object.values(BLOCK_EXPLORERS);

export const normalizeUrl = (url: string): string => url.replace(/\/+$/, '');

const BLOCK_EXPLORER_STORAGE_KEY = 'blockExplorer';

export const saveBlockExplorer = async (url: string): Promise<boolean> => {
  try {
    await DefaultPreference.setName(GROUP_IO_SHROUD);
    await DefaultPreference.set(BLOCK_EXPLORER_STORAGE_KEY, url);
    return true;
  } catch (error) {
    console.error('Error saving block explorer:', error);
    return false;
  }
};

export const getBlockExplorerUrl = async (): Promise<string> => {
  try {
    await DefaultPreference.setName(GROUP_IO_SHROUD);
    const url = (await DefaultPreference.get(BLOCK_EXPLORER_STORAGE_KEY)) as string | null;
    return url ?? BLOCK_EXPLORERS.default.url;
  } catch {
    return BLOCK_EXPLORERS.default.url;
  }
};
