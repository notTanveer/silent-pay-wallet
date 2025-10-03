export interface IndexerOutput {
  transactionId: string;
  vout: number;
  pubKey: string;  // 32-byte x-only pubkey as hex
  value: number;
  isSpent: boolean;
}

export interface IndexerTransaction {
  blockHeight: number;
  blockHash: string;
  txid: string;
  scanTweak: string;  // 33-byte compressed pubkey as hex
  outputs: IndexerOutput[];
}

export interface SilentPaymentUTXOBase {
  txid: string;
  vout: number;
  value: number;
  pubKey: string;
  blockHeight: number;
  blockHash: string;
  isSpent: boolean;
  timestamp: number;
}

export interface SilentPaymentUTXO extends SilentPaymentUTXOBase {
  tweak: Uint8Array;
}

export interface SilentPaymentUTXOSerializable extends SilentPaymentUTXOBase {
  tweakHex: string;  // Hex-encoded tweak for JSON serialization
}

export interface SilentPaymentIndexerConfig {
  baseUrl: string;
  timeout?: number;
}

export interface HealthResponse {
  status: string;
  message?: string;
}

export interface IndexerTransactionData {
  id: string;  // Transaction ID
  blockHeight: number;
  blockHash: string;
  scanTweak: string;  // 33-byte compressed pubkey as hex
  outputs: IndexerOutput[];
}

export interface TransactionResponse {
  transactions: IndexerTransactionData[];
}

export interface ScanProgress {
  currentBlock: number;
  totalBlocks: number;
  blocksScanned: number;
  percentComplete: number;
  utxosFound: number;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;
