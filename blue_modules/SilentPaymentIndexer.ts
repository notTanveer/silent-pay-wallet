import { IndexerHttpClient } from '../helpers/silent-payments/IndexerHttpClient';
import type {
  HealthResponse,
  LatestBlockHeightResponse,
  TransactionResponse,
  IndexerTransaction,
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

  async getLatestBlockHeight(): Promise<LatestBlockHeightResponse> {
    return this.httpClient.get<LatestBlockHeightResponse>(
      '/silent-block/latest-height',
      'Error fetching latest block height'
    );
  }

  /**
   * Scan forward with batch processing for better performance.
   * Fetches multiple blocks in parallel to speed up scanning.
   * 
   * @param {number} startHeight - Starting block height
   * @param {number} endHeight - Ending block height
   * @param {Function} processTransactions - Callback to process transactions from each block
   * @param {ScanProgressCallback} onProgress - Optional progress callback
   * @param {number} batchSize - Number of blocks to fetch in parallel (default: 10)
   */
  async scanForwardWithCallback(
    startHeight: number,
    endHeight: number,
    processTransactions: (transactions: IndexerTransaction[], blockHeight: number) => Promise<number>,
    onProgress?: ScanProgressCallback,
    batchSize: number = 10
  ): Promise<void> {
    try {
      console.log(`Scanning forward from block ${startHeight} to ${endHeight} (${endHeight - startHeight + 1} blocks)...`);
      
      await this.scanBlocks(startHeight, endHeight, processTransactions, onProgress, batchSize);
      console.log('Forward scan with callback complete.');
    } catch (error) {
      console.error('Error during forward scan with callback:', error);
      throw error;
    }
  }

  private async scanBlocks(
    startHeight: number,
    endHeight: number,
    onBlockProcessed?: (transactions: IndexerTransaction[], height: number) => Promise<number>,
    onProgress?: ScanProgressCallback,
    batchSize: number = 10
  ): Promise<void> {
    const totalBlocks = endHeight - startHeight + 1;
    let blocksScanned = 0;
    let utxosFound = 0;
    const failedBlocks: number[] = [];
    
    console.log(`[Indexer] Scanning forward from block ${startHeight} to ${endHeight} (${totalBlocks} blocks, batch size: ${batchSize})...`);
    
    // First pass: scan blocks in batches for better performance
    for (let batchStart = startHeight; batchStart <= endHeight; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, endHeight);
      const batchPromises: Promise<{ height: number; response: TransactionResponse | null }>[] = [];
      
      console.log(`[Indexer] Fetching batch: blocks ${batchStart} to ${batchEnd}...`);
      
      // fetch multiple blocks in parallel
      for (let height = batchStart; height <= batchEnd; height++) {
        batchPromises.push(
          this.getTransactionsByHeight(height)
            .then(response => {
              console.log(`[Indexer] ✓ Fetched block ${height}: ${response.transactions.length} transaction(s)`);
              return { height, response };
            })
            .catch(error => {
              console.warn(`[Indexer] ✗ Failed to fetch block ${height}:`, error.message);
              failedBlocks.push(height);
              return { height, response: null };
            })
        );
      }
      
      // wait for all blocks in this batch
      const batchResults = await Promise.all(batchPromises);
      
      console.log(`[Indexer] Processing batch results for blocks ${batchStart} to ${batchEnd}...`);
      for (const { height, response } of batchResults) {
        if (response && response.transactions && response.transactions.length > 0 && onBlockProcessed) {
          console.log(`[Indexer] Calling onBlockProcessed for block ${height}...`);
          const foundInBlock = await onBlockProcessed(response.transactions, height);
          utxosFound += foundInBlock;
          
          // Yield to UI after processing each block with transactions
          // This prevents long-running transaction processing from freezing the UI
          await new Promise(resolve => setTimeout(resolve, 0));
        } else if (response) {
          console.log(`[Indexer] Block ${height} has no transactions, skipping...`);
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
      }
      
      console.log(`[Indexer] Batch complete: ${blocksScanned}/${totalBlocks} blocks scanned, ${utxosFound} UTXOs found so far`);
      
      // Yield to event loop between batches to prevent UI freeze
      // This allows React Native to process UI updates, user interactions, etc.
      // Using setTimeout(0) instead of setImmediate for React Native compatibility
      if (batchEnd < endHeight) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // Second pass: retry failed blocks
    if (failedBlocks.length > 0) {
      console.log(`Retrying ${failedBlocks.length} failed blocks...`);
      
      for (const height of failedBlocks) {
        try {
          const response = await this.getTransactionsByHeight(height);
          
          if (response.transactions && response.transactions.length > 0 && onBlockProcessed) {
            const foundInBlock = await onBlockProcessed(response.transactions, height);
            utxosFound += foundInBlock;
          }
          
          console.log(`Successfully retried block ${height}`);
          
          // small delay to prevent UI freezing during retries
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to retry block ${height}:`, error);
        }
      }
    }
    
    console.log(
      `[Indexer] ✓ Scan complete: ${blocksScanned} blocks processed, ` +
      `${failedBlocks.length} blocks failed permanently, ` +
      `${utxosFound} UTXOs found`
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

export default SilentPaymentIndexer;
