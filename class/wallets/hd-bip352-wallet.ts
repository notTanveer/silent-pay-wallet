import * as bip39 from 'bip39';
import { Buffer } from 'buffer';
import { HDSegwitBech32Wallet } from './hd-segwit-bech32-wallet.ts';
import { AbstractHDElectrumWallet } from './abstract-hd-electrum-wallet.ts';
import { getDefaultIndexer } from '../../blue_modules/SilentPaymentIndexer';
import {
  getSilentPaymentAddress,
  getScanPrivateKey,
  getSpendPrivateKey,
  getScanPublicKey,
  getSpendPublicKey,
  TransactionProcessor,
  SilentPaymentTransactionBuilder,
  type IndexerTransaction,
  type SilentPaymentUTXO,
  type SilentPaymentUTXOSerializable,
  type ScanProgressCallback,
} from '../../helpers/silent-payments';
import { CreateTransactionResult, CreateTransactionTarget, CreateTransactionUtxo, Transaction, Utxo } from './types.ts';
import * as bitcoin from 'bitcoinjs-lib';


export class HDSilentPaymentsWallet extends HDSegwitBech32Wallet {
  static readonly type = 'HDSilentPaymentsWallet';
  static readonly typeReadable = 'HD Silent Payments';
  // @ts-ignore: override
  public readonly type = HDSilentPaymentsWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = HDSilentPaymentsWallet.typeReadable;

  private readonly POLLING_INTERVAL_MS = 30000;
  private readonly DEFAULT_MAX_BLOCKS = 100;
  private readonly BATCH_SIZE = 3;
  private readonly TAPROOT_ACTIVATION_HEIGHT = 921311;

  private cachedSeed: Buffer | null = null;
  private transactionProcessor: TransactionProcessor | null = null;
  private lastScannedBlock: number = 0;
  private _birthHeight: number = this.TAPROOT_ACTIVATION_HEIGHT;
  private spUTXOsCache: SilentPaymentUTXO[] | null = null;
  private activeScanPromise: Promise<number> | null = null;
  private shouldCancelScan: boolean = false;
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private isPollingActive: boolean = false;
  private onBalanceChangeCallback: (() => void) | null = null;
  private onPersistCallback: (() => void) | null = null;

  setOnBalanceChangeCallback(callback: (() => void) | null): void {
    this.onBalanceChangeCallback = callback;
  }

  setOnPersistCallback(callback: (() => void) | null): void {
    this.onPersistCallback = callback;
  }

  static fromJson(obj: string): HDSilentPaymentsWallet {
    const data = JSON.parse(obj);
    const wallet = new HDSilentPaymentsWallet();
    
    for (const key of Object.keys(data)) {
      if (key === '_utxos_serializable') {
        const serializable = data[key] || [];
        wallet._utxo = serializable.map((utxo: SilentPaymentUTXOSerializable) => ({
          ...utxo,
          tweak: new Uint8Array(Buffer.from(utxo.tweakHex, 'hex')),
        }));
      } else if (key === 'lastScannedBlock') {
        wallet.lastScannedBlock = data[key] || 0;
      } else if (key === '_birthHeight') {
        wallet._birthHeight = data[key] || wallet.TAPROOT_ACTIVATION_HEIGHT;
      } else if (key !== '_utxo' && key !== 'transactionProcessor' && key !== 'cachedSeed' && key !== 'spUTXOsCache' && key !== 'activeScanPromise') {
        (wallet as any)[key] = data[key];
      }
    }
    
    return wallet;
  }

  prepareForSerialization(): void {
    super.prepareForSerialization();
    
    const spUtxos = this.getSilentPaymentUTXOs();
    (this as any)._utxos_serializable = spUtxos.map((utxo): SilentPaymentUTXOSerializable => {
      const { tweak, ...rest } = utxo;
      return {
        ...rest,
        tweakHex: Buffer.from(tweak).toString('hex'),
      };
    });
    
    (this as any).lastScannedBlock = this.lastScannedBlock;
    (this as any)._birthHeight = this._birthHeight;
  }

  private getSilentPaymentUTXOs(): SilentPaymentUTXO[] {
    if (this.spUTXOsCache !== null) {
      return this.spUTXOsCache;
    }
    
    this.spUTXOsCache = this._utxo.filter((u): u is SilentPaymentUTXO => 
      'tweak' in u && u.tweak instanceof Uint8Array
    );
    
    return this.spUTXOsCache;
  }

  private invalidateUTXOCache(): void {
    this.spUTXOsCache = null;
  }

  private addUTXO(utxo: SilentPaymentUTXO): boolean {
    const key = `${utxo.txid}:${utxo.vout}`;
    const exists = this._utxo.some(u => `${u.txid}:${u.vout}` === key);
    
    if (exists) {
      return false;
    }
    
    this._utxo.push(utxo);
    this.invalidateUTXOCache();
    return true;
  }

  private markUTXOAsSpent(txid: string, vout: number): boolean {
    const utxo = this._utxo.find(u => u.txid === txid && u.vout === vout) as SilentPaymentUTXO | undefined;
    
    if (utxo && 'isSpent' in utxo && !utxo.isSpent) {
      utxo.isSpent = true;
      this.invalidateUTXOCache();
      
      if (this.onBalanceChangeCallback) {
        this.onBalanceChangeCallback();
      }
      
      if (this.onPersistCallback) {
        this.onPersistCallback();
      }
      
      return true;
    }
    
    return false;
  }

  private ensureTransactionProcessor(): void {
    if (this.transactionProcessor !== null) return;

    const seed = this.getSeed();
    this.transactionProcessor = new TransactionProcessor(seed);
  }

  getSilentPaymentAddress(): string | null {
    const seed = this.getSeed();
    return getSilentPaymentAddress(seed);
  }

  getScanPrivateKey(): Uint8Array {
    const seed = this.getSeed();
    return getScanPrivateKey(seed);
  }

  getSpendPrivateKey(): Uint8Array {
    const seed = this.getSeed();
    return getSpendPrivateKey(seed);
  }

  getScanPublicKey(): Uint8Array {
    const seed = this.getSeed();
    return getScanPublicKey(seed);
  }

  getSpendPublicKey(): Uint8Array {
    const seed = this.getSeed();
    return getSpendPublicKey(seed);
  }

  private getSeed(): Buffer {
    if (this.cachedSeed)
      return this.cachedSeed;

    const mnemonic = this.secret;
    this.cachedSeed = bip39.mnemonicToSeedSync(mnemonic, '');
    return this.cachedSeed;
  }

  private async processTransactions(
    transactions: IndexerTransaction[], 
    blockHeight: number
  ): Promise<{ utxos: SilentPaymentUTXO[], lastScannedBlock: number }> {
    this.ensureTransactionProcessor();
    
    const silentPaymentAddress = this.getSilentPaymentAddress()!;
    const validTransactions = transactions.filter(
      tx => tx.scanTweak && tx.outputs && tx.outputs.length > 0
    );
    
    const newUTXOs = await this.transactionProcessor!.processBatch(validTransactions, silentPaymentAddress);
    
    return {
      utxos: newUTXOs,
      lastScannedBlock: Math.max(blockHeight, this.lastScannedBlock),
    };
  }

  private commitUTXOs(utxos: SilentPaymentUTXO[], newLastScannedBlock: number): number {
    let addedCount = 0;
    
    for (const utxo of utxos) {
      if (this.addUTXO(utxo)) {
        addedCount++;
      }
    }
    
    // Always update lastScannedBlock to track progress, even if no UTXOs found
    if (newLastScannedBlock > this.lastScannedBlock) {
      this.lastScannedBlock = newLastScannedBlock;
    }
    
    // Trigger callbacks if state changed
    if (addedCount > 0) {
      if (this.onBalanceChangeCallback) {
        this.onBalanceChangeCallback();
      }
    }
    
    // Always persist when lastScannedBlock updates to track scan progress
    if (newLastScannedBlock > 0 && this.onPersistCallback) {
      this.onPersistCallback();
    }
    
    return addedCount;
  }

  cancelScan(): void {
    if (this.activeScanPromise !== null) {
      console.log('[SP] Cancelling active scan...');
      this.shouldCancelScan = true;
    }
    this.stopPolling();
  }

  isScanActive(): boolean {
    return this.activeScanPromise !== null;
  }

  private startPolling(): void {
    if (this.isPollingActive) {
      console.log('[SP] Polling already active, skipping...');
      return;
    }

    console.log(`[SP] Starting polling every ${this.POLLING_INTERVAL_MS / 1000} seconds...`);
    this.isPollingActive = true;
    
    this.pollingIntervalId = setInterval(async () => {
      try {
        console.log('[SP] Polling for new blocks...');
        await this.scanForPayments(this.DEFAULT_MAX_BLOCKS);
      } catch (error) {
        console.error('[SP] Error during polling:', error);
      }
    }, this.POLLING_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollingIntervalId !== null) {
      console.log('[SP] Stopping polling...');
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
      this.isPollingActive = false;
    }
  }

  isPolling(): boolean {
    return this.isPollingActive;
  }

  /**
   * Scan forward for silent payments (from wallet birth/last scan to latest block).
   * This is called when the user refreshes or opens the wallet.
   * Uses incremental scanning - only scans blocks since last scan.
   * Respects wallet birth height - will not scan blocks before the wallet was created.
   * 
   * Thread-safe: If a scan is already in progress, returns the existing promise to avoid redundant work.
   * Can be cancelled using cancelScan() method.
   * 
   * @param {number} maxBlocks - Maximum number of blocks to scan per call (default: DEFAULT_MAX_BLOCKS)
   * @param {ScanProgressCallback} onProgress - Optional callback for progress updates
   * @param {boolean} forceFullScan - Force a full scan ignoring lastScannedBlock (default: false)
   * @returns {Promise<number>} - Number of new UTXOs found
   */
  async scanForPayments(
    maxBlocks: number = this.DEFAULT_MAX_BLOCKS,
    onProgress?: ScanProgressCallback,
    forceFullScan: boolean = false
  ): Promise<number> {
    if (this.activeScanPromise !== null) {
      console.log('[SP] Scan in progress, reusing...');
      return this.activeScanPromise;
    }
    
    this.shouldCancelScan = false;
    this.activeScanPromise = this.performScan(maxBlocks, onProgress, forceFullScan);
    
    try {
      const result = await this.activeScanPromise;
      return result;
    } finally {
      this.activeScanPromise = null;
      this.shouldCancelScan = false;
    }
  }

  private async performScan(
    maxBlocks: number,
    onProgress?: ScanProgressCallback,
    forceFullScan: boolean = false
  ): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const latestHeightResponse = await indexer.getLatestBlockHeight();
      const latestHeight = latestHeightResponse.height;
      const effectiveBirthHeight = Math.max(this._birthHeight, this.TAPROOT_ACTIVATION_HEIGHT);
      
      if (latestHeight <= 0) {
        throw new Error(`Invalid latest block height: ${latestHeight}`);
      }
      
      let startHeight: number;
      let endHeight: number = latestHeight;
      
      if (!forceFullScan && this.lastScannedBlock > 0) {
        startHeight = this.lastScannedBlock + 1;
        
        if (startHeight > latestHeight) {
          return 0;
        }
        
        const blocksSinceLastScan = latestHeight - this.lastScannedBlock;
        
        if (blocksSinceLastScan > maxBlocks) {
          endHeight = this.lastScannedBlock + maxBlocks;
        }
        
        console.log(`[SP] Incremental: scanning ${startHeight} to ${endHeight}`);
      } else {
        startHeight = effectiveBirthHeight;
        const totalAvailableBlocks = latestHeight - effectiveBirthHeight + 1;
        
        if (totalAvailableBlocks > maxBlocks) {
          endHeight = startHeight + maxBlocks - 1;
        }
        
        console.log(`[SP] Full scan: ${startHeight} to ${endHeight} (${endHeight - startHeight + 1} blocks)`);
      }
      
      if (startHeight > endHeight) {
        return 0;
      }
      
      let totalUTXOsAdded = 0;
      
      await indexer.scanForwardWithCallback(
        startHeight,
        endHeight,
        async (transactions, blockHeight) => {
          if (this.shouldCancelScan) {
            console.log('[SP] Scan cancelled at block', blockHeight);
            throw new Error('SCAN_CANCELLED');
          }
          
          const result = await this.processTransactions(transactions, blockHeight);
          const addedCount = this.commitUTXOs(result.utxos, blockHeight);
          totalUTXOsAdded += addedCount;
          
          if (addedCount > 0) {
            console.log(`[SP] Block ${blockHeight}: +${addedCount} UTXO(s)`);
          }
          
          return addedCount;
        },
        onProgress,
        this.BATCH_SIZE
      );
      
      if (totalUTXOsAdded > 0) {
        console.log(`[SP] Scan complete: ${totalUTXOsAdded} new UTXO(s)`);
      }

      if (this.lastScannedBlock >= latestHeight && !this.isPollingActive) {
        console.log('[SP] Reached latest block height, starting polling...');
        this.startPolling();
      }
      
      return totalUTXOsAdded;
 
    } catch (error: any) {
      if (error.message === 'SCAN_CANCELLED') {
        console.log('[SP] Scan was cancelled by user');
        return 0;
      }
      
      if (error.message?.includes('not initialized')) {
        throw new Error('Silent Payment Indexer not initialized. Please configure the indexer first.');
      }
      
      console.error('[SP] Scan error:', error);
      throw error;
    }
  }

  async fetchBalance(): Promise<void> {
    try {
      await super.fetchBalance();
    } catch (regularError) {
      console.error('[SP] Error fetching regular balance:', regularError);
    }
    
    // Run silent payment scanning in the background without blocking
    // This prevents timeouts during wallet refresh operations
    this.scanForPayments()
      .then(() => this.refreshUTXOSpentStatus())
      .catch(spError => {
        console.warn('[SP] Scan failed:', spError.message);
      });
  }

  async fetchTransactions(): Promise<void> {
    try {
      await super.fetchTransactions();
    } catch (regularError) {
      console.error('[SP] Error fetching regular transactions:', regularError);
    }
    
    // Run silent payment scanning in the background without blocking
    // This prevents timeouts during wallet refresh operations
    this.scanForPayments()
      .then(() => this.refreshUTXOSpentStatus())
      .catch(spError => {
        console.warn('[SP] Scan failed:', spError.message);
      });
  }

  getUTXOs(): SilentPaymentUTXO[] {
    return this.getSilentPaymentUTXOs().filter(u => !u.isSpent);
  }

  /**
   * override parent's getUtxo() to include both regular UTXOs and SP UTXOs.
   * ensures coin control and transaction creation have access to all available UTXOs.
   */
  getUtxo(respectFrozen = false): Utxo[] {
    const regularUtxos = super.getUtxo(respectFrozen);
    const spUtxos = this.getUTXOs();
    
    return [...regularUtxos, ...spUtxos];
  }

  getBalance(): number {
    const regularBalance = super.getBalance();
    const silentPaymentBalance = this.getSilentPaymentUTXOs()
      .filter(u => !u.isSpent)
      .reduce((sum, utxo) => sum + utxo.value, 0);
    
    return regularBalance + silentPaymentBalance;
  }

  getLastScannedBlock(): number {
    return this.lastScannedBlock;
  }

  getBirthHeight(): number {
    return this._birthHeight;
  }

  setBirthHeight(height: number): void {
    if (height < 0) {
      throw new Error('Birth height cannot be negative');
    }
    
    this._birthHeight = height;
  }

  updateBirthHeight(height: number, resetScan: boolean = false): void {
    if (height < 0) {
      throw new Error('Birth height cannot be negative');
    }
    
    this._birthHeight = height;
    
    if (resetScan) {
      this.lastScannedBlock = 0;
    }
  }
  
  getTransactions(): Transaction[] {
    const regularTransactions = super.getTransactions();
    
    const utxos = this.getSilentPaymentUTXOs().filter(u => !u.isSpent);
    
    const txMap = new Map<string, SilentPaymentUTXO[]>();
    
    for (const utxo of utxos) {
      if (!txMap.has(utxo.txid)) {
        txMap.set(utxo.txid, []);
      }
      txMap.get(utxo.txid)!.push(utxo);
    }
    
    const spTransactions: Transaction[] = [];
    
    for (const [txid, utxoGroup] of txMap) {
      const totalValue = utxoGroup.reduce((sum, utxo) => sum + utxo.value, 0);
      const firstUtxo = utxoGroup[0];
      
      spTransactions.push({
        txid: txid,
        hash: txid,
        version: 2,
        size: 0,
        vsize: 0,
        weight: 0,
        locktime: 0,
        value: totalValue,
        confirmations: 7, // FIXME: dont assume stuff
        blockhash: firstUtxo.blockHash,
        time: firstUtxo.blockTime,
        blocktime: firstUtxo.blockTime,
        timestamp: firstUtxo.blockTime,
        inputs: [], // inputs are not tracked by the indexer
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
    
    const allTransactions = [...regularTransactions, ...spTransactions];
    
    allTransactions.sort((a, b) => {
      const timeA = a.timestamp || a.blocktime || 0;
      const timeB = b.timestamp || b.blocktime || 0;
      return timeB - timeA;
    });
    
    return allTransactions;
  }

  allowSend(): boolean {
    return true;
  }

  createTransaction(
    utxos: CreateTransactionUtxo[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number = AbstractHDElectrumWallet.defaultRBFSequence,
    skipSigning = false,
    masterFingerprint: number = 0,
  ): CreateTransactionResult {
    if (targets.length === 0) throw new Error('No destination provided');
    if (utxos.length === 0) throw new Error('No UTXOs provided');

    const spUtxos: SilentPaymentUTXO[] = [];
    const regularUtxos: CreateTransactionUtxo[] = [];
    
    for (const utxo of utxos) {
      if ('tweak' in utxo && utxo.tweak instanceof Uint8Array) {
        spUtxos.push(utxo as SilentPaymentUTXO);
      } else {
        regularUtxos.push(utxo);
      }
    }
    
    console.log(`[SP] Transaction: ${spUtxos.length} SP UTXOs, ${regularUtxos.length} regular UTXOs`);
    
    // Case 1: Only SP UTXOs - use SP builder exclusively
    if (spUtxos.length > 0 && regularUtxos.length === 0) {
      return this.createSPTransaction(spUtxos, targets, feeRate, changeAddress, sequence, skipSigning);
    }
    
    // Case 2: Only regular UTXOs - delegate to parent
    if (spUtxos.length === 0 && regularUtxos.length > 0) {
      return super.createTransaction(regularUtxos, targets, feeRate, changeAddress, sequence, skipSigning, masterFingerprint);
    }
    
    // Case 3: Mixed UTXOs - not yet implemented
    throw new Error('Mixed UTXO spending (SP + regular) is not yet implemented. Please select only SP UTXOs or only regular UTXOs.');
  }

  private createSPTransaction(
    spUtxos: SilentPaymentUTXO[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number,
    skipSigning: boolean
  ): CreateTransactionResult {
    console.log('[SP] Creating pure SP transaction');
    
    const validTargets = targets.filter(t => t.address);
    if (validTargets.length === 0) {
      throw new Error('No valid target addresses provided');
    }
    
    const builderTargets = validTargets.map(t => ({
      address: t.address!,
      value: t.value,
    }));
    
    const builder = new SilentPaymentTransactionBuilder(
      this.getSpendPrivateKey(),
      this.getSpendPublicKey()
    );
    
    const validation = builder.validateUTXOs(spUtxos);
    if (!validation.valid) {
      throw new Error(`UTXO validation failed: ${validation.errors.join(', ')}`);
    }
    
    const psbt = builder.createCompletePSBT(
      spUtxos,
      builderTargets,
      feeRate,
      changeAddress,
      sequence
    );
    
    let tx: bitcoin.Transaction | undefined;
    
    if (!skipSigning) {
      try {
        psbt.finalizeAllInputs();
        tx = psbt.extractTransaction();
        console.log(`[SP] Transaction created: ${tx.getId()}`);
        
        // mark utxos as spent & update balance
        for (const utxo of spUtxos) {
          this.markUTXOAsSpent(utxo.txid, utxo.vout);
        }
        console.log(`[SP] Marked ${spUtxos.length} UTXOs as spent`);
      } catch (error) {
        console.error('[SP] Failed to finalize transaction:', error);
        throw new Error(`Failed to finalize SP transaction: ${error}`);
      }
    }
    
    const totalInput = spUtxos.reduce((sum, u) => sum + u.value, 0);
    let totalOutput = 0;
    
    const psbtOutputs = psbt.txOutputs;
    for (const output of psbtOutputs) {
      totalOutput += Number(output.value);
    }
    
    const fee = totalInput - totalOutput;
    
    const outputs = psbtOutputs.map((output, index) => ({
      address: output.address,
      value: Number(output.value),
    }));
    
    const inputs = spUtxos.map(u => ({
      txid: u.txid,
      vout: u.vout,
      address: u.address,
      value: u.value,
    }));
    
    return {
      tx,
      psbt,
      inputs,
      outputs,
      fee,
    };
  }

  setLastScannedBlock(height: number): void {
    this.lastScannedBlock = height;
  }

  async refreshUTXOSpentStatus(): Promise<number> {
    try {
      const indexer = getDefaultIndexer();
      const utxos = this.getSilentPaymentUTXOs();
      let spentCount = 0;
      
      const utxosByBlock = new Map<number, SilentPaymentUTXO[]>();
      for (const utxo of utxos) {
        if (!utxosByBlock.has(utxo.height)) {
          utxosByBlock.set(utxo.height, []);
        }
        utxosByBlock.get(utxo.height)!.push(utxo);
      }
      
      for (const [blockHeight, blockUtxos] of utxosByBlock) {
        try {
          const response = await indexer.getTransactionsByHeight(blockHeight);
          
          for (const utxo of blockUtxos) {
            const tx = response.transactions.find(t => t.id === utxo.txid);
            if (tx) {
              const output = tx.outputs.find(o => o.vout === utxo.vout);
              if (output && Boolean(output.isSpent) && !utxo.isSpent) {
                this.markUTXOAsSpent(utxo.txid, utxo.vout);
                spentCount++;
              }
            }
          }
        } catch (error) {
          console.warn(`[SP] Failed to check block ${blockHeight}:`, error);
        }
      }
      
      return spentCount;
      
    } catch (error) {
      console.error('[SP] Error refreshing UTXO spent status:', error);
      throw error;
    }
  }

  clearCache(): void {
    if (this.transactionProcessor) {
      this.transactionProcessor.clear();
      this.transactionProcessor = null;
    }
    
    if (this.cachedSeed) {
      this.cachedSeed.fill(0);
      this.cachedSeed = null;
    }
    
    this.stopPolling();
    this.invalidateUTXOCache();
    this.onBalanceChangeCallback = null;
    this.onPersistCallback = null;
  }
}
