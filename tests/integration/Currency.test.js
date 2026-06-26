import DefaultPreference from 'react-native-default-preference';
import assert from 'assert';

import {
  EXCHANGE_RATES_STORAGE_KEY,
  getPreferredCurrency,
  initCurrencyDaemon,
  LAST_UPDATED,
  PREFERRED_CURRENCY_STORAGE_KEY,
  setPreferredCurrency,
  GROUP_IO_SHROUD,
} from '../../modules/currency';
import { FiatUnit } from '../../models/fiatUnit';

jest.setTimeout(90 * 1000);

describe('currency', () => {
  beforeAll(async () => {
    await DefaultPreference.setName(GROUP_IO_SHROUD);
  });

  afterEach(async () => {
    await DefaultPreference.clearAll();
  });

  it('fetches exchange rate and saves to DefaultPreference', async () => {
    await initCurrencyDaemon();
    let curString = await DefaultPreference.get(EXCHANGE_RATES_STORAGE_KEY);
    let cur = JSON.parse(curString || '{}');
    assert.ok(Number.isInteger(cur[LAST_UPDATED]));
    assert.ok(cur[LAST_UPDATED] > 0);
    assert.ok(cur.BTC_USD > 0);

    // switch currency via raw preference
    await DefaultPreference.set(PREFERRED_CURRENCY_STORAGE_KEY, FiatUnit.GBP.endPointKey);
    await initCurrencyDaemon(true);
    curString = await DefaultPreference.get(EXCHANGE_RATES_STORAGE_KEY);
    cur = JSON.parse(curString || '{}');
    assert.ok(cur.BTC_GBP > 0);

    // switch currency via setter
    await setPreferredCurrency(FiatUnit.EUR);
    await initCurrencyDaemon(true);
    const preferred = await getPreferredCurrency();
    assert.strictEqual(preferred.endPointKey, 'EUR');
    curString = await DefaultPreference.get(EXCHANGE_RATES_STORAGE_KEY);
    cur = JSON.parse(curString || '{}');
    assert.ok(cur.BTC_EUR > 0);
  });
});
