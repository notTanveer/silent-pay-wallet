import assert from 'assert';

import * as BlueElectrum from '../../blue_modules/BlueElectrum';
import { LegacyWallet } from '../../class';

jest.setTimeout(30 * 1000);

afterAll(async () => {
  // after all tests we close socket so the test suite can actually terminate
  BlueElectrum.forceDisconnect();
});

beforeAll(async () => {
  // awaiting for Electrum to be connected. For RN Electrum would naturally connect
  // while app starts up, but for tests we need to wait for it
  await BlueElectrum.connectMain();
});

describe('LegacyWallet', function () {
  it('can serialize and unserialize correctly', () => {
    const a = new LegacyWallet();
    a.setLabel('my1');
    const key = JSON.stringify(a);

    const b = LegacyWallet.fromJson(key);
    assert.strictEqual(b.type, LegacyWallet.type);
    assert.strictEqual(key, JSON.stringify(b));
  });

  it('can fetch balance', async () => {
    const w = new LegacyWallet();
    w._address = '115fUy41sZkAG14CmdP1VbEKcNRZJWkUWG'; // hack internals
    assert.ok(w.weOwnAddress('115fUy41sZkAG14CmdP1VbEKcNRZJWkUWG'));
    assert.ok(!w.weOwnAddress('aaa'));
    // @ts-ignore wrong type on purpose
    assert.ok(!w.weOwnAddress(false));
    assert.ok(w.getBalance() === 0);
    assert.ok(w.getUnconfirmedBalance() === 0);
    assert.ok(w._lastBalanceFetch === 0);
    await w.fetchBalance();
    assert.ok(w.getBalance() === 18262000);
    assert.ok(w.getUnconfirmedBalance() === 0);
    assert.ok(w._lastBalanceFetch > 0);
  });

  it('can fetch TXs and derive UTXO from them', async () => {
    const w = new LegacyWallet();
    w._address = '3GCvDBAktgQQtsbN6x5DYiQCMmgZ9Yk8BK';
    await w.fetchTransactions();
    assert.strictEqual(w.getTransactions().length, 1);

    for (const tx of w.getTransactions()) {
      assert.ok(tx.hash);
      assert.ok(tx.value);
      assert.ok(tx.timestamp);
      assert.ok(tx.confirmations! > 1);
    }

    assert.ok(w.weOwnTransaction('b2ac59bc282083498d1e87805d89bef9d3f3bc216c1d2c4dfaa2e2911b547100'));
    assert.ok(!w.weOwnTransaction('825c12f277d1f84911ac15ad1f41a3de28e9d906868a930b0a7bca61b17c8881'));

    assert.strictEqual(w.getUtxo().length, 1);

    for (const tx of w.getUtxo()) {
      assert.strictEqual(tx.txid, 'b2ac59bc282083498d1e87805d89bef9d3f3bc216c1d2c4dfaa2e2911b547100');
      assert.strictEqual(tx.vout, 0);
      assert.strictEqual(tx.address, '3GCvDBAktgQQtsbN6x5DYiQCMmgZ9Yk8BK');
      assert.strictEqual(tx.value, 51432);
      assert.ok(tx.confirmations! > 0);
    }
  });

  // poor-mans tests with different params, since it works better with our DIY tests retrier
  const cases = [
    // Transaction with missing address output https://www.blockchain.com/btc/tx/d45818ae11a584357f7b74da26012d2becf4ef064db015a45bdfcd9cb438929d
    ['addresses for vout missing', '1PVfrmbn1vSMoFZB2Ga7nDuXLFDyJZHrHK'],
    // ['txdatas were coming back null from BlueElectrum because of high batchsize', '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo'],
    // skipped because its slow and flaky if being run in pack with other electrum tests. uncomment and run single
    // if you need to debug huge electrum batches
  ];

  const caseRunner = async (address: string) => {
    const w = new LegacyWallet();
    w._address = address;
    await w.fetchTransactions();

    assert.ok(w.getTransactions().length > 0);
    for (const tx of w.getTransactions()) {
      assert.ok(tx.hash);
      assert.ok(tx.value);
      assert.ok(tx.timestamp);
      assert.ok(tx.confirmations! > 1);
    }
  };

  it('can fetch TXs when ' + cases[0][0], async () => await caseRunner(cases[0][1]), 240000);

  it('can fetch UTXO', async () => {
    const w = new LegacyWallet();
    w._address = '12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX';
    await w.fetchUtxo();
    assert.ok(w._utxo.length > 0, 'unexpected empty UTXO');
    assert.ok(w.getUtxo().length > 0, 'unexpected empty UTXO');

    assert.ok(w.getUtxo()[0].value);
    assert.ok(w.getUtxo()[0].vout === 1, JSON.stringify(w.getUtxo()[0]));
    assert.ok(w.getUtxo()[0].txid);
    assert.ok(w.getUtxo()[0].confirmations);
    assert.ok(w.getUtxo()[0].txhex);
  });
});
