import { Buffer } from 'buffer';
import { SilentPaymentUTXO, SilentPaymentUTXOSerializable } from './types';

/**
 * UTXORepository
 * 
 * Single Responsibility: Manage UTXO storage, retrieval, and serialization
 * 
 * Handles:
 * - Adding UTXOs with deduplication
 * - Querying unspent UTXOs
 * - Balance calculation
 * - Serialization for persistence
 */
export class UTXORepository {
  private utxos: SilentPaymentUTXO[] = [];
  private utxosSerializable: SilentPaymentUTXOSerializable[] = [];

  /**
   * Add a new UTXO if it doesn't already exist
   * @returns true if added, false if duplicate
   */
  add(utxo: SilentPaymentUTXO): boolean {
    const exists = this.utxos.some(
      u => u.txid === utxo.txid && u.vout === utxo.vout
    );

    if (!exists) {
      this.utxos.push(utxo);
      this.utxosSerializable.push({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        pubKey: utxo.pubKey,
        blockHeight: utxo.blockHeight,
        blockHash: utxo.blockHash,
        tweakHex: Buffer.from(utxo.tweak).toString('hex'),
        isSpent: utxo.isSpent,
      });
      return true;
    }
    return false;
  }

  getAll(): SilentPaymentUTXO[] {
    return this.utxos.filter(u => !u.isSpent);
  }

  getBalance(): number {
    return this.utxos
      .filter(u => !u.isSpent)
      .reduce((sum, utxo) => sum + utxo.value, 0);
  }

  getSerializable(): SilentPaymentUTXOSerializable[] {
    return this.utxosSerializable;
  }

  loadFromSerializable(serializable: SilentPaymentUTXOSerializable[]): void {
    this.utxosSerializable = serializable || [];
    this.utxos = this.utxosSerializable.map(utxo => ({
      ...utxo,
      tweak: new Uint8Array(Buffer.from(utxo.tweakHex, 'hex')),
    }));
  }

  clear(): void {
    this.utxos = [];
    this.utxosSerializable = [];
  }
}
