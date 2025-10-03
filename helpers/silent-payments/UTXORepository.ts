import { Buffer } from 'buffer';
import { SilentPaymentUTXO, SilentPaymentUTXOSerializable } from './types';

/**
 * repository for managing Silent Payment UTXOs
 * 
 * handles:
 * - Adding UTXOs with deduplication (O(1) using Map)
 * - Querying unspent UTXOs
 * - Balance calculation
 * - Serialization for persistence
 */
export class UTXORepository {
  private utxos: SilentPaymentUTXO[] = [];
  private utxosSerializable: SilentPaymentUTXOSerializable[] = [];
  private utxoMap: Map<string, SilentPaymentUTXO> = new Map();

  private getUtxoKey(txid: string, vout: number): string {
    return `${txid}:${vout}`;
  }

  add(utxo: SilentPaymentUTXO): boolean {
    const key = this.getUtxoKey(utxo.txid, utxo.vout);

    if (this.utxoMap.has(key)) {
      return false;
    }

    this.utxos.push(utxo);
    this.utxoMap.set(key, utxo);
    this.utxosSerializable.push({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      pubKey: utxo.pubKey,
      blockHeight: utxo.blockHeight,
      blockHash: utxo.blockHash,
      tweakHex: Buffer.from(utxo.tweak).toString('hex'),
      isSpent: utxo.isSpent,
      timestamp: utxo.timestamp,
    });
    return true;
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
    
    // Rebuild the map for O(1) lookups
    this.utxoMap.clear();
    for (const utxo of this.utxos) {
      const key = this.getUtxoKey(utxo.txid, utxo.vout);
      this.utxoMap.set(key, utxo);
    }
  }

  clear(): void {
    this.utxos = [];
    this.utxosSerializable = [];
    this.utxoMap.clear();
  }

  markAsSpent(txid: string, vout: number): boolean {
    const key = this.getUtxoKey(txid, vout);
    const utxo = this.utxoMap.get(key);
    
    if (utxo && !utxo.isSpent) {
      utxo.isSpent = true;
      
      // Update serializable array
      const serializableUtxo = this.utxosSerializable.find(
        u => u.txid === txid && u.vout === vout
      );
      if (serializableUtxo) {
        serializableUtxo.isSpent = true;
      }
      
      return true;
    }
    return false;
  }
}
