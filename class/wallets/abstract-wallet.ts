import b58 from 'bs58check';
import { sha256 } from '@noble/hashes/sha256';

import { BitcoinUnit, Chain } from '../../models/bitcoinUnits';
import { CreateTransactionResult, CreateTransactionUtxo, Transaction, Utxo } from './types';

type WalletWithPassphrase = AbstractWallet & { getPassphrase: () => string };
type UtxoMetadata = {
  frozen?: boolean;
  memo?: string;
};

export class AbstractWallet {
  static readonly type = 'abstract';
  static readonly typeReadable = 'abstract';
  // @ts-ignore: override
  public readonly type = AbstractWallet.type;
  // @ts-ignore: override
  public readonly typeReadable = AbstractWallet.typeReadable;

  static fromJson(obj: string): AbstractWallet {
    const obj2 = JSON.parse(obj);
    const temp = new this();
    for (const key2 of Object.keys(obj2)) {
      // @ts-ignore This kind of magic is not allowed in typescript, we should try and be more specific
      temp[key2] = obj2[key2];
    }

    return temp;
  }

  segwitType?: 'p2wpkh' | 'p2sh(p2wpkh)' | 'p2tr';
  _derivationPath?: string;
  label: string;
  secret: string;
  balance: number;
  unconfirmed_balance: number;
  _address: string | false;
  _utxo: Utxo[];
  _lastTxFetch: number;
  _lastBalanceFetch: number;
  preferredBalanceUnit: BitcoinUnit;
  chain: Chain;
  hideBalance: boolean;
  userHasSavedExport: boolean;
  _hideTransactionsInWalletsList: boolean;
  _utxoMetadata: Record<string, UtxoMetadata>;

  constructor() {
    this.label = '';
    this.secret = ''; // private key or recovery phrase
    this.balance = 0;
    this.unconfirmed_balance = 0;
    this._address = false; // cache
    this._utxo = [];
    this._lastTxFetch = 0;
    this._lastBalanceFetch = 0;
    this.preferredBalanceUnit = BitcoinUnit.BTC;
    this.chain = Chain.ONCHAIN;
    this.hideBalance = false;
    this.userHasSavedExport = false;
    this._hideTransactionsInWalletsList = false;
    this._utxoMetadata = {};
  }

  /**
   * @returns {number} Timestamp (millisecsec) of when last transactions were fetched from the network
   */
  getLastTxFetch(): number {
    return this._lastTxFetch;
  }

  getID(): string {
    const thisWithPassphrase = this as unknown as WalletWithPassphrase;
    const passphrase = thisWithPassphrase.getPassphrase ? thisWithPassphrase.getPassphrase() : '';
    const path = this._derivationPath ?? '';
    const string2hash = this.type + this.getSecret() + passphrase + path;
    return Buffer.from(sha256(string2hash)).toString('hex');
  }

  getTransactions(): Transaction[] {
    throw new Error('not implemented');
  }

  getUserHasSavedExport(): boolean {
    return this.userHasSavedExport;
  }

  setUserHasSavedExport(value: boolean): void {
    this.userHasSavedExport = value;
  }

  getHideTransactionsInWalletsList(): boolean {
    return this._hideTransactionsInWalletsList;
  }

  setHideTransactionsInWalletsList(value: boolean): void {
    this._hideTransactionsInWalletsList = value;
  }

  /**
   *
   * @returns {string}
   */
  getLabel(): string {
    if (this.label.trim().length === 0) {
      return 'Wallet';
    }
    return this.label;
  }

  getXpub(): string | false {
    return this._address;
  }

  /**
   *
   * @returns {number} Available to spend amount, int, in sats
   */
  getBalance(): number {
    return this.balance + (this.getUnconfirmedBalance() < 0 ? this.getUnconfirmedBalance() : 0);
  }

  getPreferredBalanceUnit(): BitcoinUnit {
    for (const value of Object.values(BitcoinUnit)) {
      if (value === this.preferredBalanceUnit) {
        return this.preferredBalanceUnit;
      }
    }
    return BitcoinUnit.BTC;
  }

  async allowOnchainAddress(): Promise<boolean> {
    throw new Error('allowOnchainAddress: Not implemented');
  }

  allowReceive(): boolean {
    return true;
  }

  allowSend(): boolean {
    return true;
  }

  allowSilentPaymentSend(): boolean {
    return false;
  }

  allowRBF(): boolean {
    return false;
  }

  allowCosignPsbt(): boolean {
    return false;
  }

  allowMasterFingerprint(): boolean {
    return false;
  }

  allowXpub(): boolean {
    return false;
  }

  weOwnAddress(address: string): boolean {
    throw Error('not implemented');
  }

  weOwnTransaction(txid: string): boolean {
    throw Error('not implemented');
  }

  /**
   * Returns delta of unconfirmed balance. For example, if theres no
   * unconfirmed balance its 0
   *
   * @return {number} Satoshis
   */
  getUnconfirmedBalance(): number {
    return this.unconfirmed_balance;
  }

  setLabel(newLabel: string): this {
    this.label = newLabel;
    return this;
  }

  getSecret(): string {
    return this.secret;
  }

  setSecret(newSecret: string): this {
    this.secret = newSecret;
    return this;
  }

  getLatestTransactionTime(): string | 0 {
    return 0;
  }

  /**
   * @deprecated
   * TODO: be more precise on the type
   */

  createTx(): any {
    throw Error('not implemented');
  }

  /**
   *
   * @param utxos {Array.<{vout: Number, value: Number, txid: String, address: String}>} List of spendable utxos
   * @param targets {Array.<{value: Number, address: String}>} Where coins are going. If theres only 1 target and that target has no value - this will send MAX to that address (respecting fee rate)
   * @param feeRate {Number} satoshi per byte
   * @param changeAddress {String} Excessive coins will go back to that address
   * @param sequence {Number} Used in RBF
   * @param skipSigning {boolean} Whether we should skip signing, use returned `psbt` in that case
   * @param masterFingerprint {number} Decimal number of wallet's master fingerprint
   * @returns {{outputs: Array, tx: Transaction, inputs: Array, fee: Number, psbt: Psbt}}
   */
  createTransaction(
    utxos: CreateTransactionUtxo[],
    targets: {
      address: string;
      value?: number;
    }[],
    feeRate: number,
    changeAddress: string,
    sequence: number,
    skipSigning = false,
    masterFingerprint: number,
  ): CreateTransactionResult {
    throw Error('not implemented');
  }

  getAddress(): string | false | undefined {
    throw Error('not implemented');
  }

  getAddressAsync(): Promise<string | false | undefined> {
    return new Promise(resolve => resolve(this.getAddress()));
  }

  async getChangeAddressAsync(): Promise<string | false | undefined> {
    return new Promise(resolve => resolve(this.getAddress()));
  }

  useWithHardwareWalletEnabled(): boolean {
    return false;
  }

  async wasEverUsed(): Promise<boolean> {
    throw new Error('Not implemented');
  }

  /**
   * Returns _all_ external addresses in hierarchy (for HD wallets) or just address for single-address wallets
   * _Not_ internal ones, as this method is supposed to be used for subscription of external notifications.
   *
   * @returns string[] Addresses
   */
  getAllExternalAddresses(): string[] {
    return [];
  }

  /*
   * Converts zpub to xpub
   *
   * @param {String} zpub
   * @returns {String} xpub
   */
  _zpubToXpub(zpub: string): string {
    let data = b58.decode(zpub);
    data = data.slice(4);
    data = Buffer.concat([Buffer.from('0488b21e', 'hex'), data]);

    return b58.encode(data);
  }

  prepareForSerialization(): void {}

  /*
   * Get metadata (frozen, memo) for a specific UTXO
   *
   * @param {String} txid - transaction id
   * @param {number} vout - an index number of the output in transaction
   */
  getUTXOMetadata(txid: string, vout: number): UtxoMetadata {
    return this._utxoMetadata[`${txid}:${vout}`] || {};
  }

  /*
   * Set metadata (frozen, memo) for a specific UTXO
   *
   * @param {String} txid - transaction id
   * @param {number} vout - an index number of the output in transaction
   * @param {{memo: String, frozen: Boolean}} opts - options to attach to UTXO
   */
  setUTXOMetadata(txid: string, vout: number, opts: UtxoMetadata): void {
    const meta = this._utxoMetadata[`${txid}:${vout}`] || {};
    if ('memo' in opts) meta.memo = opts.memo;
    if ('frozen' in opts) meta.frozen = opts.frozen;
    this._utxoMetadata[`${txid}:${vout}`] = meta;
  }

  isSegwit() {
    return false;
  }
}
