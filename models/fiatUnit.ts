import { fetch } from '../util/fetch';
import untypedFiatUnit from './fiatUnits.json';

export const FiatUnitSource = {
  Coinbase: 'Coinbase',
  CoinGecko: 'CoinGecko',
  Kraken: 'Kraken',
  Yadio: 'Yadio',
  YadioConvert: 'YadioConvert',
  Exir: 'Exir',
  coinpaprika: 'coinpaprika',
  BNR: 'BNR',
} as const;

const handleError = (source: string, ticker: string, error: Error) => {
  throw new Error(
    `Could not update rate for ${ticker} from ${source}\n: ${error.message}. ` +
      `\nMake sure the network you're on has access to ${source}.`,
  );
};

const fetchRate = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
};

interface CoinbaseResponse {
  data: {
    amount: string;
  };
}

interface CoinGeckoResponse {
  bitcoin: {
    [ticker: string]: number;
  };
}

interface KrakenResponse {
  result: {
    [pair: string]: {
      c: [string];
    };
  };
  error: string[];
}

interface YadioResponse {
  [ticker: string]: {
    price: number;
  };
}

interface YadioConvertResponse {
  rate: number;
}

interface ExirResponse {
  last: string;
}

interface CoinpaprikaResponse {
  quotes: {
    [ticker: string]: {
      price: number;
    };
  };
}

const RateExtractors = {
  Coinbase: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate(`https://api.coinbase.com/v2/prices/BTC-${ticker.toUpperCase()}/buy`)) as CoinbaseResponse;
      const rate = Number(json?.data?.amount);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('Coinbase', ticker, error);
      return undefined as never;
    }
  },

  CoinGecko: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate(
        `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${ticker.toLowerCase()}`,
      )) as CoinGeckoResponse;
      const rate = Number(json?.bitcoin?.[ticker.toLowerCase()]);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('CoinGecko', ticker, error);
      return undefined as never;
    }
  },

  Kraken: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate(`https://api.kraken.com/0/public/Ticker?pair=XXBTZ${ticker.toUpperCase()}`)) as KrakenResponse;
      if (json?.error?.length) throw new Error(json.error[0]);
      const rate = Number(json?.result?.[`XXBTZ${ticker.toUpperCase()}`]?.c?.[0]);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('Kraken', ticker, error);
      return undefined as never;
    }
  },

  BNR: async (): Promise<number> => {
    try {
      // Fetching USD to RON rate

      const xmlData = await (await fetch('https://www.bnr.ro/nbrfxrates.xml')).text();
      const matches = xmlData.match(/<Rate currency="USD">([\d.]+)<\/Rate>/);
      if (matches && matches[1]) {
        const usdToRonRate = parseFloat(matches[1]);
        const btcToUsdRate = await RateExtractors.CoinGecko('USD');
        // Convert BTC to RON using the USD to RON exchange rate
        return btcToUsdRate * usdToRonRate;
      }
      throw new Error('No valid USD to RON rate found');
    } catch (error: any) {
      handleError('BNR', 'RON', error);
      return undefined as never;
    }
  },

  Yadio: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate(`https://api.yadio.io/json/${ticker}`)) as YadioResponse;
      const rate = Number(json?.[ticker]?.price);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('Yadio', ticker, error);
      return undefined as never;
    }
  },

  YadioConvert: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate(`https://api.yadio.io/convert/1/BTC/${ticker}`)) as YadioConvertResponse;
      const rate = Number(json?.rate);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('YadioConvert', ticker, error);
      return undefined as never;
    }
  },

  Exir: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate('https://api.exir.io/v1/ticker?symbol=btc-irt')) as ExirResponse;
      const rate = Number(json?.last);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('Exir', ticker, error);
      return undefined as never;
    }
  },

  coinpaprika: async (ticker: string): Promise<number> => {
    try {
      const json = (await fetchRate('https://api.coinpaprika.com/v1/tickers/btc-bitcoin?quotes=INR')) as CoinpaprikaResponse;
      const rate = Number(json?.quotes?.INR?.price);
      if (!(rate >= 0)) throw new Error('Invalid data received');
      return rate;
    } catch (error: any) {
      handleError('coinpaprika', ticker, error);
      return undefined as never;
    }
  },
} as const;

export type TFiatUnit = {
  endPointKey: string;
  symbol: string;
  locale: string;
  country: string;
  source: 'Coinbase' | 'CoinGecko' | 'Kraken' | 'Yadio' | 'YadioConvert' | 'Exir' | 'coinpaprika' | 'BNR';
};

type TFiatUnits = {
  [key: string]: TFiatUnit;
};

export const FiatUnit = untypedFiatUnit as TFiatUnits;

export type FiatUnitType = {
  endPointKey: string;
  symbol: string;
  locale: string;
  country: string;
  source: keyof typeof FiatUnitSource;
};

export async function getFiatRate(ticker: string): Promise<number> {
  return await RateExtractors[FiatUnit[ticker].source](ticker);
}
