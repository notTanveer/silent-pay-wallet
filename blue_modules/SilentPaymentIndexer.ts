import { IndexerHttpClient } from '../helpers/silent-payments/IndexerHttpClient';
import type {
  HealthResponse,
  TransactionResponse,
  IndexerTransactionData,
  SilentPaymentIndexerConfig,
  ScanProgressCallback,
} from '../helpers/silent-payments/types';


export class SilentPaymentIndexer {
  private httpClient: IndexerHttpClient;

  constructor(config: SilentPaymentIndexerConfig) {
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    this.httpClient = new IndexerHttpClient(baseUrl, config.timeout);
  }

  getBaseUrl(): string {
    return this.httpClient.getBaseUrl();
  }

  setBaseUrl(url: string): void {
    this.httpClient.setBaseUrl(url);
  }

  async getHealth(): Promise<HealthResponse> {
    return this.httpClient.get<HealthResponse>(
      '/health',
      'Error fetching indexer health'
    );
  }

  async getTransactionsByHeight(height: number): Promise<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(
      `/transactions/height/${height}`,
      `Error fetching transactions by height ${height}`
    );
  }

  async getLatestBlockHeight(): Promise<number> {
    return this.httpClient.get<number>(
      '/silent-block/latest-height',
      'Error fetching last block height'
    );
  }

  /**
   * Scan backwards and process each block with a callback.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan
   * @param {Function} processTransactions - Callback to process transactions from each block
   * @param {number} fromHeight - Optional starting height (defaults to latest)
   * @param {ScanProgressCallback} onProgress - Optional progress callback
   */
  async scanBackwardsWithCallback(
    maxBlocks: number,
    processTransactions: (transactions: IndexerTransactionData[], blockHeight: number) => Promise<void>,
    fromHeight?: number,
    onProgress?: ScanProgressCallback
  ): Promise<void> {
    try {
      const startHeight = fromHeight ?? await this.getLatestBlockHeight();
      const endHeight = Math.max(0, startHeight - maxBlocks + 1);
      
      await this.scanBlocks(startHeight, endHeight, 'backward', processTransactions, onProgress);
      console.log('Backward scan with callback complete.');
    } catch (error) {
      console.error('Error during backward scan with callback:', error);
      throw error;
    }
  }

  private async scanBlocks(
    startHeight: number,
    endHeight: number,
    direction: 'forward' | 'backward',
    onBlockProcessed?: (transactions: IndexerTransactionData[], height: number) => Promise<void>,
    onProgress?: ScanProgressCallback
  ): Promise<void> {
    const increment = direction === 'forward' ? 1 : -1;
    const shouldContinue = direction === 'forward' 
      ? (h: number) => h <= endHeight 
      : (h: number) => h >= endHeight;
    
    const totalBlocks = Math.abs(endHeight - startHeight) + 1;
    let blocksScanned = 0;
    let utxosFound = 0;
    const failedBlocks: number[] = [];
    
    console.log(`Scanning ${direction} from block ${startHeight} to ${endHeight}...`);
    
    // first pass: scan all blocks, track failures
    for (let height = startHeight; shouldContinue(height); height += increment) {
      try {
        const response = await this.getTransactionsByHeight(height);
        
        if (response.transactions && response.transactions.length > 0 && onBlockProcessed) {
          await onBlockProcessed(response.transactions, height);
        }
        
        blocksScanned++;
        
        if (onProgress) {
          onProgress({
            currentBlock: height,
            totalBlocks,
            blocksScanned,
            percentComplete: (blocksScanned / totalBlocks) * 100,
            utxosFound,
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch block ${height}, will retry later...`);
        failedBlocks.push(height);
        blocksScanned++;
      }
    }
    
    // second pass: retry failed blocks
    if (failedBlocks.length > 0) {
      console.log(`Retrying ${failedBlocks.length} failed blocks...`);
      
      for (const height of failedBlocks) {
        try {
          const response = await this.getTransactionsByHeight(height);
          
          if (response.transactions && response.transactions.length > 0 && onBlockProcessed) {
            await onBlockProcessed(response.transactions, height);
          }
          
          console.log(`Successfully retried block ${height}`);
        } catch (error) {
          console.error(`Failed to retry block ${height}:`, error);
        }
      }
    }
    
    console.log(
      `Scan complete: ${blocksScanned} blocks processed, ` +
      `${failedBlocks.length} blocks failed permanently`
    );
  }
}


let defaultIndexer: SilentPaymentIndexer | null = null;

export function initializeIndexer(config: SilentPaymentIndexerConfig): void {
  defaultIndexer = new SilentPaymentIndexer(config);
}

export function getDefaultIndexer(): SilentPaymentIndexer {
  if (!defaultIndexer) {
    throw new Error('Silent Payment Indexer not initialized. Call initializeIndexer() first.');
  }
  return defaultIndexer;
}

export function isIndexerInitialized(): boolean {
  return defaultIndexer !== null;
}

export function resetIndexer(): void {
  defaultIndexer = null;
}

export default SilentPaymentIndexer;
