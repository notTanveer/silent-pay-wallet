import { Utxo } from '../../class/wallets/types';

interface IndexerOutput {
  transactionId: string;
  vout: number;
  pubKey: string;
  value: number;
  isSpent: boolean | number; // 0 = false (not spent), 1 = true (spent)
}

export interface IndexerTransaction {
  id: string;
  blockHeight: number;
  blockHash: string;
  blockTime: number;
  scanTweak: string;
  outputs: IndexerOutput[];
}

export interface TransactionResponse {
  transactions: IndexerTransaction[];
}

export interface LatestBlockHeightResponse {
  height: number;
}

export interface BlockHeightByTimestampResponse {
  blockHeight: number;
}

export interface SilentPaymentUTXO extends Utxo {
  silentPaymentAddress: string;
  pubKey: string;
  tweak: Uint8Array;
  blockHash: string;
  blockTime: number;
  isSpent: boolean;
}

export interface SilentPaymentUTXOSerializable extends Omit<SilentPaymentUTXO, 'tweak'> {
  tweakHex: string;
}

export interface SilentPaymentIndexerConfig {
  baseUrl: string;
  timeout?: number;
  retry?: {
    count: number;
    delay: number; // ms
  };
}

export interface HealthResponse {
  status: string;
  message?: string;
}

export interface ScanProgress {
  currentBlock: number;
  tipHeight: number;
  totalBlocks: number;
  blocksScanned: number;
  percentComplete: number;
  utxosFound: number;
}

export type ScanStatus = 'idle' | 'scanning' | 'paused' | 'error';

export interface ScanStateInfo {
  status: ScanStatus;
  progress: ScanProgress | null;
  startedAt: number | null;
  eta: number | null;
  etaComputedAt: number | null;
  error: string | null;
  lastScannedBlock: number;
}

export const IDLE_SCAN_STATE: ScanStateInfo = {
  status: 'idle',
  progress: null,
  startedAt: null,
  eta: null,
  etaComputedAt: null,
  error: null,
  lastScannedBlock: 0,
};

export interface TransactionByTxidResponse {
  transaction: IndexerTransaction;
}

export type ScanProgressCallback = (progress: ScanProgress) => void | Promise<void>;
