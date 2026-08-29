declare module 'coinselect' {
  export type CoinSelectTarget = {
    address: string;
    value?: number;
    script?: {
      length: number;
    };
  };

  /**
   * not an accurate definition since coinselect lib can ignore certain fields, and just passes through unknown fields,
   * which we actually rely on
   */
  export type CoinSelectUtxo = {
    vout: number;
    value: number;
    txid: string;
    address?: string;
    wif?: string;
    txhex?: string;
    script?: {
      length: number;
    };
  };

  export type CoinSelectReturnInput = {
    vout: number;
    value: number;
    txid: string;
    address?: string;
    wif?: string;
    txhex?: string;
    script?: {
      length: number;
    };
  };

  export type CoinSelectOutput = {
    // no address and no script.hex - this is the change output coinselect appended;
    // no address but a script.hex - a custom script target (like OP_RETURN) passed through
    address?: string;
    value: number;
    script?: {
      length?: number;
      hex?: string;
    };
  };

  export default function coinSelect(
    utxos: CoinSelectUtxo[],
    targets: CoinSelectTarget[],
    feeRate: number,
    changeAddress?: string,
  ): {
    inputs: CoinSelectReturnInput[];
    outputs: CoinSelectOutput[];
    fee: number;
  };
}

declare module 'coinselect/utils' {
  /** an output is not worth creating if it costs more than this to spend later */
  export function dustThreshold(output: { script?: { length: number } }, feeRate: number): number;
}

declare module 'coinselect/split' {
  type Utxo = {
    vout: number;
    value: number;
    txid: string;
  };

  export default function coinSelectSplit<U extends Utxo>(
    utxos: U[],
    targets: { address: string; value?: number }[],
    feeRate: number,
    changeAddress?: string,
  ): {
    inputs: CoinselectReturnInput[];
    outputs: {
      address?: string;
      value: number;
    }[];
    fee: number;
  };
}
