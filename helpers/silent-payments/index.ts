// Key Derivation
export {
  deriveSilentPaymentKeys,
  getScanPrivateKey,
  getSpendPrivateKey,
  getScanPublicKey,
  getSpendPublicKey,
  getSilentPaymentAddress,
  type SilentPaymentKeys,
} from './SilentPaymentKeyDerivation';

// Scanning (pure functions)
export {
  calculateBlockRange,
  findMatchingOutputs,
  scanTransactions,
  processBlock,
  mergeUTXOs,
  createCancellationToken,
  type CancellationToken,
} from './scan';

// Spending (pure functions)
export {
  validateSpendInputs,
  buildUnsignedPSBT,
  signPSBT,
  createSignedTransaction,
  createUnsignedTransaction,
  extractInputsFromHex,
  calculateNetValueChange,
  type SpendTarget,
  type CoinSelectResult,
  type SignedTransaction,
  type UnsignedTransaction,
} from './spend';

// Domain types
export {
  makeOutPoint,
  parseOutPoint,
  isSilentPaymentUTXO,
  ok,
  err,
  mapResult,
  flatMapResult,
  scanErrorMessage,
  spendErrorMessage,
  type OutPoint,
  type ScanKeys,
  type SpendKeys,
  type SilentPaymentUTXO,
  type SilentPaymentUTXOSerializable,
  type IndexerTransaction,
  type IndexerOutput,
  type BlockRange,
  type ScanConfig,
  type ScanProgress,
  type ScanProgressCallback,
  type MatchedOutput,
  type Result,
  type ScanError,
  type SpendError,
  type SilentPaymentIndexerConfig,
  type HealthResponse,
  type LatestBlockHeightResponse,
  type TransactionResponse,
} from './domain';

// Legacy exports (for backwards compatibility during migration)
export { TransactionProcessor } from './TransactionProcessor';
export { IndexerHttpClient } from './IndexerHttpClient';

// Re-export legacy types from types.ts
export type {
  SilentPaymentIndexerConfig as LegacyIndexerConfig,
  HealthResponse as LegacyHealthResponse,
  IndexerOutput as LegacyIndexerOutput,
  TransactionResponse as LegacyTransactionResponse,
  IndexerTransaction as LegacyIndexerTransaction,
  SilentPaymentUTXO as LegacySilentPaymentUTXO,
  SilentPaymentUTXOSerializable as LegacySilentPaymentUTXOSerializable,
  ScanProgressCallback as LegacyScanProgressCallback,
} from './types';
