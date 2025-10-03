import * as bip39 from 'bip39';
import { Buffer } from 'buffer';
import { HDSegwitBech32Wallet } from './hd-segwit-bech32-wallet.ts';
import { getDefaultIndexer } from '../../blue_modules/SilentPaymentIndexer';
import {
  SilentPaymentKeyDerivation,
  UTXORepository,
  TransactionProcessor,
  type IndexerTransaction,
  type SilentPaymentUTXO,
} from '../../helpers/silent-payments';

// ============================================================================
// HD Silent Payments Wallet
// ============================================================================

export class HDSilentPaymentsWallet extends HDSegwitBech32Wallet {
  static readonly type = 'HDSilentPaymentsWallet';
  static readonly typeReadable = 'HD Silent Payments';
  // @ts-ignore: override
  public readonly type = HDSilentPaymentsWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = HDSilentPaymentsWallet.typeReadable;

  private cachedSeed: Buffer | null = null;
  private keyDerivation: SilentPaymentKeyDerivation | null = null;
  private utxoRepository: UTXORepository = new UTXORepository();
  private transactionProcessor: TransactionProcessor | null = null;
  private lastScannedBlock: number = 0;

  /**
   * Restore wallet from JSON storage
   * Converts serialized UTXOs back to runtime format with Uint8Array tweaks
   */
  static fromJson(obj: string): HDSilentPaymentsWallet {
    const data = JSON.parse(obj);
    const wallet = new HDSilentPaymentsWallet();
    
    for (const key of Object.keys(data)) {
      if (key === '_utxos_serializable') {
        wallet.utxoRepository.loadFromSerializable(data[key] || []);
      } else if (key !== '_utxos' && key !== 'utxoRepository') {
        (wallet as any)[key] = data[key];
      }
    }
    
    return wallet;
  }

  /**
   * Prepare wallet for JSON serialization
   * Converts Uint8Array tweaks to hex strings for storage
   */
  prepareForSerialization(): void {
    super.prepareForSerialization();
    (this as any)._utxos_serializable = this.utxoRepository.getSerializable();
  }

  /**
   * Initialize services lazily
   */
  private ensureServices(): void {
    if (this.keyDerivation !== null && this.transactionProcessor !== null) return;

    const seed = this.getSeed();
    this.keyDerivation = new SilentPaymentKeyDerivation(seed);
    this.transactionProcessor = new TransactionProcessor(this.keyDerivation);
  }

  getSilentPaymentAddress(): string | null {
    this.ensureServices();
    return this.keyDerivation!.getSilentPaymentAddress();
  }

  getScanPrivateKey(): Uint8Array {
    this.ensureServices();
    return this.keyDerivation!.getScanPrivateKey();
  }

  getSpendPrivateKey(): Uint8Array {
    this.ensureServices();
    return this.keyDerivation!.getSpendPrivateKey();
  }

  getScanPublicKey(): Uint8Array {
    this.ensureServices();
    return this.keyDerivation!.getScanPublicKey();
  }

  getSpendPublicKey(): Uint8Array {
    this.ensureServices();
    return this.keyDerivation!.getSpendPublicKey();
  }

  /**
   * Override to bypass passphrase processing for performance.
   * Since we don't support passphrases for Silent Payments wallets, 
   * we use an empty string to skip expensive passphrase derivation.
   * 
   * @return {Buffer} wallet seed without passphrase
   */
  private getSeed(): Buffer {
    if (this.cachedSeed) return this.cachedSeed;
    
    const mnemonic = this.secret;
    this.cachedSeed = bip39.mnemonicToSeedSync(mnemonic, '');
    return this.cachedSeed;
  }

  /**
   * Process transactions and add to repository
   */
  private processAndAddTransactions(transactions: any[], blockHeight: number): void {
    this.ensureServices();
    
    for (const tx of transactions) {
      if (tx.scanTweak && tx.outputs && tx.outputs.length > 0) {
        const indexerTx: IndexerTransaction = {
          blockHeight: tx.blockHeight || blockHeight,
          blockHash: tx.blockHash || '',
          txid: tx.id,
          scanTweak: tx.scanTweak,
          outputs: tx.outputs,
        };
        
        const matchedUTXOs = this.transactionProcessor!.process(indexerTx);
        for (const utxo of matchedUTXOs) {
          this.utxoRepository.add(utxo);
        }
      }
    }
    
    if (blockHeight > this.lastScannedBlock) {
      this.lastScannedBlock = blockHeight;
    }
  }

  /**
   * Scan backwards for silent payments (most recent blocks first).
   * This is called when the user refreshes or opens the wallet.
   * Scans the last 100 blocks by default.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan backwards (default: 100)
   * @returns {Promise<number>} - Number of new UTXOs found
   */
  async scanForPayments(maxBlocks: number = 100): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const initialCount = this.utxoRepository.getAll().length;
      
      console.log(`Scanning last ${maxBlocks} blocks for silent payments...`);
      
      await indexer.scanBackwardsWithCallback(
        maxBlocks,
        async (transactions, blockHeight) => {
          this.processAndAddTransactions(transactions, blockHeight);
        }
      );
      
      const finalCount = this.utxoRepository.getAll().length;
      const newUTXOCount = finalCount - initialCount;
      
      console.log(`Scan complete. Found ${newUTXOCount} new UTXOs.`);
      return newUTXOCount;
      
    } catch (error) {
      console.error('Error during silent payment scan:', error);
      throw error;
    }
  }
  
  /**
   * Scan forward for silent payments (older blocks first).
   * Use this for catching up from a specific block height.
   * 
   * @param {number} startHeight - Block height to start scanning from
   * @param {number} endHeight - Block height to scan up to (optional, defaults to latest)
   * @returns {Promise<number>} - Number of new UTXOs found
   */
  async scanForPaymentsForward(startHeight: number, endHeight?: number): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const initialCount = this.utxoRepository.getAll().length;
      
      const start = startHeight;
      const end = endHeight ?? await indexer.getLatestBlockHeight();
      
      console.log(`Scanning blocks ${start} to ${end}...`);
      
      for (let height = start; height <= end; height++) {
        try {
          const response = await indexer.getTransactionsByHeight(height);
          
          if (response.transactions && response.transactions.length > 0) {
            this.processAndAddTransactions(response.transactions, height);
          }
          
        } catch (error) {
          console.warn(`Failed to scan block ${height}:`, error);
        }
      }
      
      const finalCount = this.utxoRepository.getAll().length;
      const newUTXOCount = finalCount - initialCount;
      
      console.log(`Forward scan complete. Found ${newUTXOCount} new UTXOs.`);
      return newUTXOCount;
      
    } catch (error) {
      console.error('Error during forward silent payment scan:', error);
      throw error;
    }
  }

  getUTXOs(): SilentPaymentUTXO[] {
    return this.utxoRepository.getAll();
  }

  getBalance(): number {
    return this.utxoRepository.getBalance();
  }

  getLastScannedBlock(): number {
    return this.lastScannedBlock;
  }

  setLastScannedBlock(height: number): void {
    this.lastScannedBlock = height;
  }

  clearCache(): void {
    this.keyDerivation?.clear();
    this.keyDerivation = null;
    this.transactionProcessor = null;
    this.cachedSeed = null;
    this.utxoRepository.clear();
    this.lastScannedBlock = 0;
  }
}
