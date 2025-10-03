import { IndexerHttpClient } from '../helpers/silent-payments/IndexerHttpClient';
import type {
  HealthResponse,
  SilentBlock,
  TransactionResponse,
  IndexerTransactionData,
  SilentPaymentIndexerConfig,
} from '../helpers/silent-payments/types';


/**
 * Silent Payment Indexer Client
 * 
 * This client interfaces with the Silent Payment indexer to fetch tweaks
 * and silent blocks necessary for scanning Silent Payment transactions.
 * 
 * @see https://github.com/Bitshala-Incubator/silent-pay-indexer
 * 
 * Available Endpoints:
 * - GET /health - Health check
 * - GET /silent-block/height/:height - Get silent block by height
 * - GET /silent-block/hash/:hash - Get silent block by hash
 * - GET /transactions/height/:height - Get transactions by block height
 * - GET /transactions/hash/:hash - Get transactions by block hash
 * - GET /silent-block/latest-height - Get latest block height
 */

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

  async getSilentBlockByHeight(height: number): Promise<SilentBlock> {
    return this.httpClient.get<SilentBlock>(
      `/silent-block/height/${height}`,
      `Error fetching silent block by height ${height}`
    );
  }

  async getSilentBlockByHash(hash: string): Promise<SilentBlock> {
    return this.httpClient.get<SilentBlock>(
      `/silent-block/hash/${hash}`,
      `Error fetching silent block by hash ${hash}`
    );
  }

  async getTransactionsByHeight(height: number): Promise<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(
      `/transactions/height/${height}`,
      `Error fetching transactions by height ${height}`
    );
  }

  async getTransactionsByHash(hash: string): Promise<TransactionResponse> {
    return this.httpClient.get<TransactionResponse>(
      `/transactions/hash/${hash}`,
      `Error fetching transactions by hash ${hash}`
    );
  }

  async getLatestBlockHeight(): Promise<number> {
    return this.httpClient.get<number>(
      '/silent-block/latest-height',
      'Error fetching last block height'
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getHealth();
      return true;
    } catch (error) {
      console.error('Indexer connection test failed:', error);
      return false;
    }
  }

  /**
   * Fetch multiple silent blocks for a range of heights
   * 
   * @param {number} startHeight - Starting block height
   * @param {number} endHeight - Ending block height
   * @returns {Promise<SilentBlock[]>} Array of silent blocks
   */
  async getSilentBlocksRange(startHeight: number, endHeight: number): Promise<SilentBlock[]> {
    const blocks: SilentBlock[] = [];
    
    for (let height = startHeight; height <= endHeight; height++) {
      try {
        const block = await this.getSilentBlockByHeight(height);
        blocks.push(block);
      } catch (error) {
        console.warn(`Failed to fetch block at height ${height}, skipping...`);
      }
    }
    
    return blocks;
  }

  /**
   * Generic block scanning template method
   * Eliminates duplication between forward and backward scans
   */
  private async scanBlocks(
    startHeight: number,
    endHeight: number,
    direction: 'forward' | 'backward',
    onBlockProcessed?: (transactions: IndexerTransactionData[], height: number) => Promise<void>
  ): Promise<IndexerTransactionData[]> {
    const allTransactions: IndexerTransactionData[] = [];
    const increment = direction === 'forward' ? 1 : -1;
    const shouldContinue = direction === 'forward' 
      ? (h: number) => h <= endHeight 
      : (h: number) => h >= endHeight;
    
    console.log(`Scanning ${direction} from block ${startHeight} to ${endHeight}...`);
    
    for (let height = startHeight; shouldContinue(height); height += increment) {
      try {
        const response = await this.getTransactionsByHeight(height);
        
        if (response.transactions && response.transactions.length > 0) {
          if (onBlockProcessed) {
            await onBlockProcessed(response.transactions, height);
          } else {
            allTransactions.push(...response.transactions);
            console.log(`  Block ${height}: Found ${response.transactions.length} transaction(s)`);
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch block ${height}, skipping...`);
      }
    }
    
    if (!onBlockProcessed) {
      console.log(`${direction} scan complete. Found ${allTransactions.length} total transactions.`);
    }
    
    return allTransactions;
  }

  /**
   * Scan backwards from the latest block for a given number of blocks.
   * Useful for initial wallet sync or catching up on recent transactions.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan backwards (default: 100)
   * @param {number} fromHeight - Optional starting height (defaults to latest block)
   * @returns {Promise<IndexerTransactionData[]>} - Array of all transactions found
   */
  async scanBackwards(maxBlocks: number = 100, fromHeight?: number): Promise<IndexerTransactionData[]> {
    try {
      const startHeight = fromHeight ?? await this.getLatestBlockHeight();
      const endHeight = Math.max(0, startHeight - maxBlocks + 1);
      
      return await this.scanBlocks(startHeight, endHeight, 'backward');
    } catch (error) {
      console.error('Error during backward scan:', error);
      throw error;
    }
  }

  /**
   * Scan backwards and process each block with a callback.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan
   * @param {Function} processTransactions - Callback to process transactions from each block
   * @param {number} fromHeight - Optional starting height (defaults to latest)
   */
  async scanBackwardsWithCallback(
    maxBlocks: number,
    processTransactions: (transactions: IndexerTransactionData[], blockHeight: number) => Promise<void>,
    fromHeight?: number
  ): Promise<void> {
    try {
      const startHeight = fromHeight ?? await this.getLatestBlockHeight();
      const endHeight = Math.max(0, startHeight - maxBlocks + 1);
      
      await this.scanBlocks(startHeight, endHeight, 'backward', processTransactions);
      console.log('Backward scan with callback complete.');
    } catch (error) {
      console.error('Error during backward scan with callback:', error);
      throw error;
    }
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
