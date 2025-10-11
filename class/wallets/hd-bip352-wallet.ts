import * as bip39 from 'bip39';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { HDSegwitBech32Wallet } from './hd-segwit-bech32-wallet.ts';
import { getDefaultIndexer } from '../../blue_modules/SilentPaymentIndexer';
import {
  SilentPaymentKeyDerivation,
  UTXORepository,
  TransactionProcessor,
  SilentPaymentSpender,
  type IndexerTransaction,
  type SilentPaymentUTXO,
  type ScanProgressCallback,
} from '../../helpers/silent-payments';
import { Transaction, CreateTransactionUtxo, CreateTransactionTarget, CreateTransactionResult } from './types.ts';
import { CoinSelectTarget } from 'coinselect';


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

  static fromJson(obj: string): HDSilentPaymentsWallet {
    const data = JSON.parse(obj);
    const wallet = new HDSilentPaymentsWallet();
    
    for (const key of Object.keys(data)) {
      if (key === '_utxos_serializable') {
        wallet.utxoRepository.loadFromSerializable(data[key] || []);
      } else if (key === 'lastScannedBlock') {
        wallet.lastScannedBlock = data[key] || 0;
      } else if (key !== '_utxos' && key !== 'utxoRepository') {
        (wallet as any)[key] = data[key];
      }
    }
    
    return wallet;
  }

  prepareForSerialization(): void {
    super.prepareForSerialization();
    (this as any)._utxos_serializable = this.utxoRepository.getSerializable();
    (this as any).lastScannedBlock = this.lastScannedBlock;
  }

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
    if (this.cachedSeed)
      return this.cachedSeed;

    const mnemonic = this.secret;
    this.cachedSeed = bip39.mnemonicToSeedSync(mnemonic, '');
    return this.cachedSeed;
  }

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
   * Uses incremental scanning - only scans blocks since last scan.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan backwards (default: 100)
   * @param {ScanProgressCallback} onProgress - Optional callback for progress updates
   * @param {boolean} forceFullScan - Force a full scan ignoring lastScannedBlock (default: false)
   * @returns {Promise<number>} - Number of new UTXOs found
   */
  async scanForPayments(
    maxBlocks: number = 100,
    onProgress?: ScanProgressCallback,
    forceFullScan: boolean = false
  ): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const initialCount = this.utxoRepository.getAll().length;
      
      const latestHeight = await indexer.getLatestBlockHeight();
      
      // Implement incremental scanning
      let blocksToScan = maxBlocks;
      let startHeight = latestHeight;
      
      if (!forceFullScan && this.lastScannedBlock > 0) {
        // Only scan blocks since last scan
        const blocksSinceLastScan = latestHeight - this.lastScannedBlock;
        
        if (blocksSinceLastScan <= 0) {
          console.log('Already up to date. No new blocks to scan.');
          return 0;
        }
        
        blocksToScan = Math.min(blocksSinceLastScan, maxBlocks);
        console.log(
          `Incremental scan: ${blocksSinceLastScan} new blocks since last scan (block ${this.lastScannedBlock}). ` +
          `Scanning ${blocksToScan} blocks...`
        );
      } else {
        console.log(`Full scan: Scanning last ${maxBlocks} blocks for silent payments...`);
      }
      
      let blocksProcessed = 0;
      
      await indexer.scanBackwardsWithCallback(
        blocksToScan,
        async (transactions, blockHeight) => {
          this.processAndAddTransactions(transactions, blockHeight);
          blocksProcessed++;
        },
        startHeight,
        onProgress
      );
      
      const finalCount = this.utxoRepository.getAll().length;
      const newUTXOCount = finalCount - initialCount;
      
      console.log(`Scan complete. Found ${newUTXOCount} new UTXOs.`);
      
      return newUTXOCount;
      
    } catch (error: any) {
      if (error.message?.includes('not initialized')) {
        console.error('[SP Wallet] Indexer not initialized. Cannot scan for payments.');
        throw new Error('Silent Payment indexer is not configured. Please check app settings.');
      }
      
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
   * @param {ScanProgressCallback} onProgress - Optional callback for progress updates
   * @returns {Promise<number>} - Number of new UTXOs found
   */
  async scanForPaymentsForward(
    startHeight: number,
    endHeight?: number,
    onProgress?: ScanProgressCallback
  ): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const initialCount = this.utxoRepository.getAll().length;
      
      const start = startHeight;
      const end = endHeight ?? await indexer.getLatestBlockHeight();
      
      const totalBlocks = end - start + 1;
      let blocksScanned = 0;
      
      console.log(`Scanning blocks ${start} to ${end}...`);
      
      for (let height = start; height <= end; height++) {
        try {
          const response = await indexer.getTransactionsByHeight(height);
          
          if (response.transactions && response.transactions.length > 0) {
            this.processAndAddTransactions(response.transactions, height);
          }
          
          blocksScanned++;
          
          if (onProgress) {
            const currentCount = this.utxoRepository.getAll().length;
            onProgress({
              currentBlock: height,
              totalBlocks,
              blocksScanned,
              percentComplete: (blocksScanned / totalBlocks) * 100,
              utxosFound: currentCount - initialCount,
            });
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

  async fetchBalance(): Promise<void> {
    try {
      console.log(`[SP Wallet] Fetching balance for ${this.getLabel()}...`);

      await this.scanForPayments();
      await this.refreshUTXOSpentStatus();
      
      console.log(`[SP Wallet] Balance: ${this.getBalance()} sats, UTXOs: ${this.getUTXOs().length}`);
    } catch (error) {
      console.error('[SP Wallet] Error fetching balance:', error);
      throw error;
    }
  }

  async fetchTransactions(): Promise<void> {
    try {
      console.log(`[SP Wallet] Fetching transactions for ${this.getLabel()}...`);

      await this.scanForPayments();
      await this.refreshUTXOSpentStatus();

      console.log(`[SP Wallet] Transactions updated: ${this.getTransactions().length} transactions`);
    } catch (error) {
      console.error('[SP Wallet] Error fetching transactions:', error);
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
  
  getTransactions(): Transaction[] {
    const utxos = this.getUTXOs();
    
    const txMap = new Map<string, SilentPaymentUTXO[]>();
    
    for (const utxo of utxos) {
      if (!txMap.has(utxo.txid)) {
        txMap.set(utxo.txid, []);
      }
      txMap.get(utxo.txid)!.push(utxo);
    }
    
    const transactions: Transaction[] = [];
    
    for (const [txid, utxoGroup] of txMap) {
      const totalValue = utxoGroup.reduce((sum, utxo) => sum + utxo.value, 0);
      const firstUtxo = utxoGroup[0];
      const timestamp = firstUtxo.timestamp || Math.floor(Date.now() / 1000);
      
      transactions.push({
        txid: txid,
        hash: txid,
        version: 2,
        size: 0,
        vsize: 0,
        weight: 0,
        locktime: 0,
        value: totalValue,
        confirmations: 6, // FIXME: Assume confirmed (could calculate from blockHeight)
        blockhash: firstUtxo.blockHash,
        time: timestamp,
        blocktime: timestamp,
        timestamp: timestamp,
        inputs: [], // Silent Payments don't expose input details for privacy
        outputs: utxoGroup.map((utxo, index) => ({
          value: utxo.value,
          n: utxo.vout,
          scriptPubKey: {
            asm: '',
            hex: utxo.pubKey,
            reqSigs: 1,
            type: 'witness_v1_taproot',
            addresses: [this.getSilentPaymentAddress() || ''],
          },
        })),
      });
    }
    
    transactions.sort((a, b) => {
      const utxoA = utxos.find(u => u.txid === a.txid);
      const utxoB = utxos.find(u => u.txid === b.txid);
      if (!utxoA || !utxoB) return 0;
      return utxoB.blockHeight - utxoA.blockHeight;
    });
    
    return transactions;
  }

  allowSend(): boolean {
    return true; // Spending is now supported!
  }

  /**
   * Creates a transaction to spend Silent Payment UTXOs
   * Overrides parent implementation to handle tweaked Taproot keys
   * 
   * @param utxos - Array of UTXOs to spend (should be Silent Payment UTXOs)
   * @param targets - Array of outputs (address + value)
   * @param feeRate - Fee rate in sat/vByte
   * @param changeAddress - Address for change output (will use Silent Payment address)
   * @param sequence - Transaction sequence number (for RBF)
   * @param skipSigning - If true, returns unsigned PSBT
   * @param masterFingerprint - Master fingerprint (unused for Silent Payments)
   * @returns Transaction result with tx, inputs, outputs, fee, and psbt
   */
  createTransaction(
    utxos: CreateTransactionUtxo[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number = 0xffffffff,
    skipSigning: boolean = false,
    masterFingerprint: number = 0,
  ): CreateTransactionResult {
    if (targets.length === 0) {
      throw new Error('No destination provided');
    }

    // Ensure services are initialized
    this.ensureServices();

    // Get the spend private key and public key
    const spendPrivKey = this.getSpendPrivateKey();
    const spendPubKey = this.getSpendPublicKey();
    const silentPaymentAddress = this.getSilentPaymentAddress();

    if (!silentPaymentAddress) {
      throw new Error('Failed to derive Silent Payment address');
    }

    // Get Silent Payment UTXOs from repository
    const spUtxos = this.getUTXOs();
    
    // Create a map of txid:vout to SilentPaymentUTXO for quick lookup
    const utxoMap = new Map<string, SilentPaymentUTXO>();
    for (const spUtxo of spUtxos) {
      const key = `${spUtxo.txid}:${spUtxo.vout}`;
      utxoMap.set(key, spUtxo);
    }

    // Verify all input UTXOs are Silent Payment UTXOs we own
    for (const utxo of utxos) {
      const key = `${utxo.txid}:${utxo.vout}`;
      const spUtxo = utxoMap.get(key);
      
      if (!spUtxo) {
        throw new Error(`UTXO ${key} not found in wallet`);
      }

      // Verify the tweaked key matches
      if (!SilentPaymentSpender.verifyTweakedKey(spUtxo, spendPrivKey)) {
        throw new Error(`UTXO ${key} verification failed - tweaked key mismatch`);
      }
    }

    // Use coin selection from parent
    const { inputs, outputs, fee } = this.coinselect(utxos, targets, feeRate);

    // Create PSBT
    const psbt = new bitcoin.Psbt();

    // Add inputs using @silent-pay/core pattern
    inputs.forEach((input, idx) => {
      const key = `${input.txid}:${input.vout}`;
      const spUtxo = utxoMap.get(key);

      if (!spUtxo) {
        throw new Error(`Silent Payment UTXO not found for input: ${key}`);
      }

      // Create Taproot input following @silent-pay/core Coin.toInput() pattern
      const taprootInput = SilentPaymentSpender.createTaprootInput(spUtxo, spendPubKey);

      // Add to PSBT
      psbt.addInput({
        hash: taprootInput.hash,
        index: taprootInput.index,
        sequence,
        witnessUtxo: {
          script: taprootInput.witnessUtxo.script,
          value: BigInt(taprootInput.witnessUtxo.value),
        },
        tapInternalKey: taprootInput.tapInternalKey,
      });
    });

    // Add outputs
    outputs.forEach(output => {
      // If no address, use Silent Payment address for change
      if (!output.address) {
        output.address = silentPaymentAddress;
      }

      psbt.addOutput({
        address: output.address,
        value: BigInt(output.value),
      });
    });

    // Sign if not skipping
    let tx: bitcoin.Transaction | undefined;
    
    if (!skipSigning) {
      // Sign each input with the tweaked key
      inputs.forEach((input, idx) => {
        const key = `${input.txid}:${input.vout}`;
        const spUtxo = utxoMap.get(key);

        if (!spUtxo) {
          throw new Error(`Silent Payment UTXO not found for signing: ${key}`);
        }

        // Sign with tweaked key
        SilentPaymentSpender.signTaprootInput(psbt, idx, spUtxo, spendPrivKey);
      });

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      tx = psbt.extractTransaction();
    }

    return {
      tx,
      inputs,
      outputs,
      fee,
      psbt,
    };
  }

  setLastScannedBlock(height: number): void {
    this.lastScannedBlock = height;
  }

  /**
   * Check if UTXOs have been spent and update their status.
   * This queries the indexer to check the spent status of stored UTXOs.
   * 
   * @returns {Promise<number>} - Number of UTXOs marked as spent
   */
  async refreshUTXOSpentStatus(): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const utxos = this.utxoRepository.getAll();
      let spentCount = 0;
      
      console.log(`Checking spent status for ${utxos.length} UTXOs...`);
      
      // group UTXOs by block height for efficient querying
      const utxosByBlock = new Map<number, SilentPaymentUTXO[]>();
      for (const utxo of utxos) {
        if (!utxosByBlock.has(utxo.blockHeight)) {
          utxosByBlock.set(utxo.blockHeight, []);
        }
        utxosByBlock.get(utxo.blockHeight)!.push(utxo);
      }
      
      // check for spent status
      for (const [blockHeight, blockUtxos] of utxosByBlock) {
        try {
          const response = await indexer.getTransactionsByHeight(blockHeight);
          
          for (const utxo of blockUtxos) {
            const tx = response.transactions.find(t => t.id === utxo.txid);
            if (tx) {
              const output = tx.outputs.find(o => o.vout === utxo.vout);
              if (output && output.isSpent && !utxo.isSpent) {
                this.utxoRepository.markAsSpent(utxo.txid, utxo.vout);
                spentCount++;
                console.log(`UTXO ${utxo.txid}:${utxo.vout} marked as spent`);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to check block ${blockHeight} for spent status:`, error);
        }
      }
      
      console.log(`Spent status check complete. ${spentCount} UTXOs marked as spent.`);
      return spentCount;
      
    } catch (error) {
      console.error('Error refreshing UTXO spent status:', error);
      throw error;
    }
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
