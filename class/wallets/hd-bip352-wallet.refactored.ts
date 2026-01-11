import * as bip39 from 'bip39';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';
import { AbstractHDElectrumWallet } from './abstract-hd-electrum-wallet';
import { HDTaprootWallet } from './hd-taproot-wallet';
import { disconnectIndexer, getDefaultIndexer } from '../../blue_modules/SilentPaymentIndexer';
import {
  getSilentPaymentAddress,
  getScanPrivateKey,
  getSpendPrivateKey,
  getSpendPublicKey,
  calculateBlockRange,
  processBlock,
  mergeUTXOs,
  createSignedTransaction,
  extractInputsFromHex,
  calculateNetValueChange,
  createCancellationToken,
  makeOutPoint,
  isSilentPaymentUTXO,
  type SilentPaymentUTXO,
  type SilentPaymentUTXOSerializable,
  type ScanProgressCallback,
  type ScanKeys,
  type SpendKeys,
  type CancellationToken,
  type CoinSelectResult,
} from '../../helpers/silent-payments';
import { CreateTransactionResult, CreateTransactionTarget, CreateTransactionUtxo, Transaction, Utxo } from './types';


const TAPROOT_ACTIVATION_HEIGHT = 927101;
const POLLING_INTERVAL_MS = 30000;
const DEFAULT_MAX_BLOCKS = 100;
const BATCH_SIZE = 3;

interface WalletScanState {
  lastScannedBlock: number;
  birthHeight: number;
}

interface PendingSpend {
  inputs: Set<string>;
}

export class HDSilentPaymentsWallet extends HDTaprootWallet {
  static readonly type = 'HDSilentPaymentsWallet';
  static readonly typeReadable = 'HD Silent Payments';
  // @ts-ignore: override
  public readonly type = HDSilentPaymentsWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = HDSilentPaymentsWallet.typeReadable;

  // State
  private scanState: WalletScanState = {
    lastScannedBlock: 0,
    birthHeight: TAPROOT_ACTIVATION_HEIGHT,
  };
  private pendingSpend: PendingSpend = { inputs: new Set() };
  private spendingTxHistory: Transaction[] = [];
  
  // Caching
  private seedCache: Buffer | null = null;
  private utxoCache: SilentPaymentUTXO[] | null = null;
  
  // Async operation control
  private scanCancellation: CancellationToken | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  
  // Callbacks
  private onBalanceChange: (() => void) | null = null;
  private onPersist: (() => void) | null = null;

  setOnBalanceChangeCallback(callback: (() => void) | null): void {
    this.onBalanceChange = callback;
  }

  setOnPersistCallback(callback: (() => void) | null): void {
    this.onPersist = callback;
  }

  static fromJson(json: string): HDSilentPaymentsWallet {
    const data = JSON.parse(json);
    const wallet = new HDSilentPaymentsWallet();

    if (data._utxos_serializable) {
      wallet._utxo = data._utxos_serializable.map((s: SilentPaymentUTXOSerializable) => ({
        ...s,
        tweak: new Uint8Array(Buffer.from(s.tweakHex, 'hex')),
      }));
    }

    wallet.scanState = {
      lastScannedBlock: data.lastScannedBlock ?? 0,
      birthHeight: data._birthHeight ?? TAPROOT_ACTIVATION_HEIGHT,
    };

    wallet.spendingTxHistory = data._sp_spending_txs ?? [];
    wallet.pendingSpend.inputs = new Set(data._sp_pending_inputs ?? []);

    const skipKeys = new Set([
      '_utxos_serializable', 'lastScannedBlock', '_birthHeight',
      '_sp_spending_txs', '_sp_pending_inputs', '_utxo',
      'transactionProcessor', 'cachedSeed', 'spUTXOsCache', 'activeScanPromise',
    ]);
    
    for (const [key, value] of Object.entries(data)) {
      if (!skipKeys.has(key)) {
        (wallet as any)[key] = value;
      }
    }

    return wallet;
  }

  prepareForSerialization(): void {
    super.prepareForSerialization();

    const spUtxos = this.getAllSPUTXOs();
    (this as any)._utxos_serializable = spUtxos.map((u): SilentPaymentUTXOSerializable => {
      const { tweak, ...rest } = u;
      return { ...rest, tweakHex: Buffer.from(tweak).toString('hex') };
    });

    (this as any).lastScannedBlock = this.scanState.lastScannedBlock;
    (this as any)._birthHeight = this.scanState.birthHeight;
    (this as any)._sp_spending_txs = this.spendingTxHistory;
    (this as any)._sp_pending_inputs = Array.from(this.pendingSpend.inputs);
  }

  // ============================================================================
  // Key Derivation
  // ============================================================================

  private getSeed(): Buffer {
    if (!this.seedCache) {
      this.seedCache = bip39.mnemonicToSeedSync(this.secret, '');
    }
    return this.seedCache;
  }

  private getScanKeys(): ScanKeys {
    const seed = this.getSeed();
    return {
      scanPrivateKey: getScanPrivateKey(seed),
      spendPublicKey: getSpendPublicKey(seed),
    };
  }

  private getSpendKeys(): SpendKeys {
    const seed = this.getSeed();
    return {
      spendPrivateKey: getSpendPrivateKey(seed),
      spendPublicKey: getSpendPublicKey(seed),
    };
  }

  getSilentPaymentAddress(): string | null {
    return getSilentPaymentAddress(this.getSeed());
  }

  // Public key getters for external use
  getScanPrivateKey(): Uint8Array { return getScanPrivateKey(this.getSeed()); }
  getSpendPrivateKey(): Uint8Array { return getSpendPrivateKey(this.getSeed()); }
  getScanPublicKey(): Uint8Array { return this.getScanKeys().spendPublicKey; /* Note: wrong name in original */ }
  getSpendPublicKey(): Uint8Array { return getSpendPublicKey(this.getSeed()); }

  // ============================================================================
  // UTXO Management
  // ============================================================================

  private getAllSPUTXOs(): SilentPaymentUTXO[] {
    return this._utxo.filter(isSilentPaymentUTXO);
  }

  private getUnspentSPUTXOs(): SilentPaymentUTXO[] {
    if (!this.utxoCache) {
      this.utxoCache = this.getAllSPUTXOs().filter(u => !u.isSpent);
    }
    return this.utxoCache;
  }

  private invalidateUTXOCache(): void {
    this.utxoCache = null;
  }

  private addNewUTXOs(newUtxos: SilentPaymentUTXO[]): number {
    const existing = this.getAllSPUTXOs();
    const { utxos: merged, addedCount } = mergeUTXOs(existing, newUtxos);
    
    if (addedCount > 0) {
      // Remove old SP UTXOs and add merged ones
      this._utxo = this._utxo.filter(u => !isSilentPaymentUTXO(u));
      this._utxo.push(...merged);
      this.invalidateUTXOCache();
      this.onBalanceChange?.();
    }
    
    return addedCount;
  }

  private markUTXOSpent(txid: string, vout: number): void {
    const utxo = this._utxo.find(u => u.txid === txid && u.vout === vout);
    if (utxo && isSilentPaymentUTXO(utxo) && !utxo.isSpent) {
      (utxo as any).isSpent = true;
      this.invalidateUTXOCache();
      this.onBalanceChange?.();
    }
  }

  // ============================================================================
  // Scanning
  // ============================================================================

  async scanForPayments(
    maxBlocks: number = DEFAULT_MAX_BLOCKS,
    onProgress?: ScanProgressCallback,
  ): Promise<number> {
    // Cancel any existing scan
    this.scanCancellation?.cancel();
    this.scanCancellation = createCancellationToken();
    
    try {
      const indexer = getDefaultIndexer();
      const { height: latestHeight } = await indexer.getLatestBlockHeight();
      
      // Calculate range
      const rangeResult = calculateBlockRange(
        {
          birthHeight: this.scanState.birthHeight,
          lastScannedBlock: this.scanState.lastScannedBlock,
          maxBlocks,
        },
        latestHeight,
      );
      
      if (!rangeResult.ok) {
        if (rangeResult.error.type === 'ALREADY_UP_TO_DATE') {
          this.startPollingIfNeeded(latestHeight);
          return 0;
        }
        throw new Error(rangeResult.error.type);
      }
      
      const { start, end } = rangeResult.value;
      const keys = this.getScanKeys();
      const spAddress = this.getSilentPaymentAddress()!;
      let totalAdded = 0;
      
      // Scan blocks
      await indexer.scanForwardWithCallback(
        start,
        end,
        async (transactions, blockHeight) => {
          if (this.scanCancellation?.isCancelled()) {
            throw new Error('SCAN_CANCELLED');
          }
          
          const newUtxos = processBlock(transactions, keys, spAddress);
          const added = this.addNewUTXOs(newUtxos);
          totalAdded += added;
          
          // Update progress
          this.scanState.lastScannedBlock = blockHeight;
          this.onPersist?.();
          
          return added;
        },
        onProgress,
        BATCH_SIZE,
      );
      
      this.startPollingIfNeeded(latestHeight);
      return totalAdded;
      
    } catch (error: any) {
      if (error.message === 'SCAN_CANCELLED') {
        return 0;
      }
      throw error;
    } finally {
      this.scanCancellation = null;
    }
  }

  cancelScan(): void {
    this.scanCancellation?.cancel();
    this.stopPolling();
    disconnectIndexer();
  }

  isScanActive(): boolean {
    return this.scanCancellation !== null;
  }

  // ============================================================================
  // Polling
  // ============================================================================

  private startPollingIfNeeded(latestHeight: number): void {
    if (this.scanState.lastScannedBlock >= latestHeight && !this.pollingInterval) {
      this.pollingInterval = setInterval(async () => {
        try {
          await this.scanForPayments(DEFAULT_MAX_BLOCKS);
        } catch (e) {
          console.error('[SP] Polling error:', e);
        }
      }, POLLING_INTERVAL_MS);
    }
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  // ============================================================================
  // Spending
  // ============================================================================

  createTransaction(
    utxos: CreateTransactionUtxo[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number = AbstractHDElectrumWallet.finalRBFSequence,
    skipSigning = false,
    masterFingerprint: number,
  ): CreateTransactionResult {
    if (targets.length === 0) throw new Error('No destination provided');
    if (utxos.length === 0) throw new Error('No UTXOs provided');

    // Separate SP and regular UTXOs - CreateTransactionUtxo can be a SilentPaymentUTXO
    const spUtxos: SilentPaymentUTXO[] = [];
    const regularUtxos: CreateTransactionUtxo[] = [];
    
    for (const utxo of utxos) {
      if ('tweak' in utxo && (utxo as any).tweak instanceof Uint8Array) {
        spUtxos.push(utxo as SilentPaymentUTXO);
      } else {
        regularUtxos.push(utxo);
      }
    }

    // Only regular UTXOs - use parent
    if (spUtxos.length === 0) {
      return super.createTransaction(regularUtxos, targets, feeRate, changeAddress, sequence, skipSigning, masterFingerprint);
    }

    // Mixed UTXOs - not supported
    if (regularUtxos.length > 0) {
      throw new Error('Mixed UTXO spending not supported. Select only SP or only regular UTXOs.');
    }

    // Pure SP transaction
    return this.createSPTransaction(spUtxos, targets, feeRate, changeAddress, sequence, skipSigning);
  }

  private createSPTransaction(
    spUtxos: SilentPaymentUTXO[],
    targets: CreateTransactionTarget[],
    feeRate: number,
    changeAddress: string,
    sequence: number,
    skipSigning: boolean,
  ): CreateTransactionResult {
    // Coin selection (uses parent's coinselect)
    const { inputs, outputs, fee } = this.coinselect(spUtxos as CreateTransactionUtxo[], targets, feeRate);

    // Map inputs back to SP UTXOs
    const inputMap = new Map(spUtxos.map(u => [makeOutPoint(u.txid, u.vout), u]));
    const spInputs = inputs.map(i => {
      const sp = inputMap.get(makeOutPoint(i.txid, i.vout));
      if (!sp) throw new Error(`UTXO not found: ${i.txid}:${i.vout}`);
      return sp;
    });

    // Reserve inputs
    const inputKeys = spInputs.map(i => makeOutPoint(i.txid, i.vout));
    inputKeys.forEach(k => this.pendingSpend.inputs.add(k));

    try {
      const spendTargets = outputs.map(o => ({
        address: o.address || changeAddress,
        value: o.value,
      }));

      const coinSelectResult: CoinSelectResult = {
        inputs: spInputs,
        outputs: spendTargets,
        fee,
      };

      if (skipSigning) {
        // Return unsigned
        const { buildUnsignedPSBT } = require('../../helpers/silent-payments/spend');
        const psbtResult = buildUnsignedPSBT(spInputs, spendTargets, this.getSpendKeys(), sequence);
        if (!psbtResult.ok) throw new Error(psbtResult.error.message);
        
        return {
          tx: undefined,
          psbt: psbtResult.value,
          inputs: inputs.map(i => ({ txid: i.txid, vout: i.vout, address: i.address, value: i.value })),
          outputs: spendTargets,
          fee,
        };
      }

      // Create signed transaction
      const result = createSignedTransaction(coinSelectResult, this.getSpendKeys());
      if (!result.ok) {
        throw new Error(result.error.type);
      }

      return {
        tx: result.value.tx,
        psbt: result.value.psbt,
        inputs: inputs.map(i => ({ txid: i.txid, vout: i.vout, address: i.address, value: i.value })),
        outputs: spendTargets,
        fee,
      };

    } catch (error) {
      // Release reserved inputs on failure
      inputKeys.forEach(k => this.pendingSpend.inputs.delete(k));
      throw error;
    }
  }

  async broadcastTx(hex: string): Promise<boolean> {
    try {
      const tx = bitcoin.Transaction.fromHex(hex);
      const spentOutpoints = extractInputsFromHex(hex);
      
      // Identify SP inputs
      const spInputs = spentOutpoints.filter(op => 
        this.pendingSpend.inputs.has(op) || 
        this._utxo.some(u => makeOutPoint(u.txid, u.vout) === op && isSilentPaymentUTXO(u))
      );

      // Broadcast
      const txid = await super.broadcastTx(hex);
      if (!txid) return false;

      // Mark UTXOs as spent and record transaction
      if (spInputs.length > 0) {
        const spentUtxos = spInputs
          .map(op => {
            const [txid, vout] = op.split(':');
            return this._utxo.find(u => u.txid === txid && u.vout === parseInt(vout, 10));
          })
          .filter(isSilentPaymentUTXO);

        // Calculate value change
        const value = calculateNetValueChange(
          spentUtxos,
          tx,
          addr => this.weOwnAddress(addr),
        );

        // Record spending transaction
        this.spendingTxHistory.push(this.buildSpendingTx(tx, value, spentUtxos));

        // Mark spent
        for (const op of spInputs) {
          const [txid, vout] = op.split(':');
          this.markUTXOSpent(txid, parseInt(vout, 10));
          this.pendingSpend.inputs.delete(op);
        }

        this.onPersist?.();
      }

      return true;

    } catch (error) {
      // Release on failure
      extractInputsFromHex(hex).forEach(op => this.pendingSpend.inputs.delete(op));
      throw error;
    }
  }

  private buildSpendingTx(tx: bitcoin.Transaction, value: number, spentUtxos: SilentPaymentUTXO[]): Transaction {
    const now = Math.floor(Date.now() / 1000);
    return {
      txid: tx.getId(),
      hash: tx.getId(),
      version: tx.version,
      size: tx.byteLength(),
      vsize: tx.virtualSize(),
      weight: tx.weight(),
      locktime: tx.locktime,
      value,
      confirmations: 0,
      blockhash: '',
      time: now,
      blocktime: now,
      timestamp: now,
      inputs: spentUtxos.map((u, i) => ({
        txid: u.txid,
        vout: u.vout,
        scriptSig: { asm: '', hex: '' },
        txinwitness: [],
        sequence: tx.ins[i]?.sequence ?? 0xfffffffd,
        addresses: [this.getSilentPaymentAddress() ?? ''],
        value: u.value,
      })),
      outputs: tx.outs.map((out, n) => ({
        value: Number(out.value),
        n,
        scriptPubKey: {
          asm: '',
          hex: Buffer.from(out.script).toString('hex'),
          reqSigs: 1,
          type: 'witness_v1_taproot',
          addresses: this.decodeOutputAddress(out.script),
        },
      })),
    };
  }

  private decodeOutputAddress(script: Buffer | Uint8Array): string[] {
    try {
      const scriptBuffer = Buffer.isBuffer(script) ? script : Buffer.from(script);
      return [bitcoin.address.fromOutputScript(scriptBuffer, bitcoin.networks.bitcoin)];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Balance & Transactions
  // ============================================================================

  getBalance(): number {
    const regularBalance = super.getBalance();
    const spBalance = this.getUnspentSPUTXOs().reduce((sum, u) => sum + u.value, 0);
    return regularBalance + spBalance;
  }

  getUTXOs(): SilentPaymentUTXO[] {
    return this.getUnspentSPUTXOs();
  }

  getUtxo(respectFrozen = false): Utxo[] {
    const spUtxos = this.getUnspentSPUTXOs();
    let regularUtxos = this._utxo.filter(u => !isSilentPaymentUTXO(u));
    
    if (!respectFrozen) {
      regularUtxos = regularUtxos.filter(({ txid, vout }) => !this.getUTXOMetadata(txid, vout).frozen);
    }
    
    return [...regularUtxos, ...spUtxos];
  }

  getTransactions(): Transaction[] {
    const regular = super.getTransactions();
    
    // Create incoming transactions from UTXOs
    const utxosByTx = new Map<string, SilentPaymentUTXO[]>();
    for (const utxo of this.getAllSPUTXOs()) {
      const list = utxosByTx.get(utxo.txid) ?? [];
      list.push(utxo);
      utxosByTx.set(utxo.txid, list);
    }

    const incoming: Transaction[] = Array.from(utxosByTx.entries()).map(([txid, utxos]) => ({
      txid,
      hash: txid,
      version: 2,
      size: 0,
      vsize: 0,
      weight: 0,
      locktime: 0,
      value: utxos.reduce((s, u) => s + u.value, 0),
      confirmations: 7,
      blockhash: utxos[0].blockHash,
      time: utxos[0].blockTime,
      blocktime: utxos[0].blockTime,
      timestamp: utxos[0].blockTime,
      inputs: [],
      outputs: utxos.map(u => ({
        value: u.value,
        n: u.vout,
        scriptPubKey: {
          asm: '',
          hex: u.pubKey,
          reqSigs: 1,
          type: 'witness_v1_taproot',
          addresses: [this.getSilentPaymentAddress() ?? ''],
        },
      })),
    }));

    const all = [...regular, ...incoming, ...this.spendingTxHistory];
    return all.sort((a, b) => (b.timestamp ?? b.blocktime ?? 0) - (a.timestamp ?? a.blocktime ?? 0));
  }

  // ============================================================================
  // State Accessors
  // ============================================================================

  getLastScannedBlock(): number {
    return this.scanState.lastScannedBlock;
  }

  setLastScannedBlock(height: number): void {
    this.scanState.lastScannedBlock = height;
  }

  getBirthHeight(): number {
    return this.scanState.birthHeight;
  }

  setBirthHeight(height: number): void {
    if (height < 0) throw new Error('Birth height cannot be negative');
    this.scanState.birthHeight = height;
  }

  updateBirthHeight(height: number, resetScan = false): void {
    this.setBirthHeight(height);
    if (resetScan) {
      this.scanState.lastScannedBlock = 0;
    }
  }

  allowSend(): boolean {
    return true;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  clearCache(): void {
    this.seedCache?.fill(0);
    this.seedCache = null;
    this.invalidateUTXOCache();
    this.stopPolling();
    this.pendingSpend.inputs.clear();
    this.onBalanceChange = null;
    this.onPersist = null;
  }

  // ============================================================================
  // Fetch overrides (maintain SP UTXOs across parent calls)
  // ============================================================================

  async fetchUtxo(): Promise<void> {
    const spUtxos = this.getAllSPUTXOs();
    try {
      await super.fetchUtxo();
    } finally {
      // Restore SP UTXOs that might have been cleared
      const existingKeys = new Set(this._utxo.map(u => `${u.txid}:${u.vout}`));
      for (const utxo of spUtxos) {
        if (!existingKeys.has(`${utxo.txid}:${utxo.vout}`)) {
          this._utxo.push(utxo);
        }
      }
      this.invalidateUTXOCache();
    }
  }

  async fetchTransactions(): Promise<void> {
    await super.fetchTransactions().catch(e => console.warn('[SP] fetchTransactions error:', e));
    await this.scanForPayments().catch(e => {
      if (e.message !== 'SCAN_CANCELLED') console.warn('[SP] scan error:', e);
    });
  }

  async fetchBalance(): Promise<void> {
    await super.fetchBalance();
  }
}
