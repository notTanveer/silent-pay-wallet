import assert from 'assert';

import { HDTaprootWallet } from '../../class';

const MNEMONIC = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo glue';
const utxos = [
  {
    height: 0,
    value: 181385,
    address: 'bc1p4mc3hspc535vj2d9qcjmtynllv38u0lvfp8gs8npt64ejgtxszuq6t4ckj', // ext_0 of MNEMONIC wallet
    txid: 'e97f982766537c5330b50ef521bbcd8811971eb7cc9fd64bda45266136f27b82',
    vout: 0,
  },
];

describe('Taproot HD (BIP86)', () => {
  it('can create', async function () {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const hd = new HDTaprootWallet();
    hd.setSecret(mnemonic);

    assert.strictEqual(true, hd.validateMnemonic());
    assert.strictEqual(hd.getMasterFingerprintHex(), '73C5DA0A');
    assert.strictEqual(
      'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ',
      hd.getXpub(),
    );

    assert.strictEqual(hd._getExternalAddressByIndex(0), 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    assert.strictEqual(hd._getExternalAddressByIndex(1), 'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh');

    assert.strictEqual(hd._getInternalAddressByIndex(0), 'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7');

    assert.strictEqual(hd._getExternalWIFByIndex(0), 'KyRv5iFPHG7iB5E4CqvMzH3WFJVhbfYK4VY7XAedd9Ys69mEsPLQ');
    assert.ok(hd._getInternalWIFByIndex(0) !== hd._getInternalWIFByIndex(1));

    assert.ok(hd.getAllExternalAddresses().includes('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'));

    assert.strictEqual(hd._getDerivationPathByAddress(hd._getExternalAddressByIndex(0)), "m/86'/0'/0'/0/0");
    assert.strictEqual(hd._getDerivationPathByAddress(hd._getExternalAddressByIndex(1)), "m/86'/0'/0'/0/1");
    assert.strictEqual(hd._getDerivationPathByAddress(hd._getInternalAddressByIndex(0)), "m/86'/0'/0'/1/0");
    assert.strictEqual(hd._getDerivationPathByAddress(hd._getInternalAddressByIndex(1)), "m/86'/0'/0'/1/1");

    assert.strictEqual(hd.getMasterFingerprintHex(), '73C5DA0A');

    assert.strictEqual(
      hd._getPubkeyByAddress(hd._getExternalAddressByIndex(0)).toString('hex'),
      'cc8a4bc64d897bddc5fbc2f670f7a8ba0b386779106cf1223c6fc5d7cd6fc115',
    );
    assert.strictEqual(
      hd._getPubkeyByAddress(hd._getInternalAddressByIndex(0)).toString('hex'),
      '399f1b2f4393f29a18c937859c5dd8a77350103157eb880f02e8c08214277cef',
    );
  });

  it('can generate addresses only via zpub', function () {
    const xpub = 'xpub6BgBgsespWvERF3LHQu6CnqdvfEvtMcQjYrcRzx53QJjSxarj2afYWcLteoGVky7D3UKDP9QyrLprQ3VCECoY49yfdDEHGCtMMj92pReUsQ';
    const hd = new HDTaprootWallet();
    hd._xpub = xpub;
    assert.strictEqual(hd._getExternalAddressByIndex(0), 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
    assert.strictEqual(hd._getExternalAddressByIndex(1), 'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh');
    assert.strictEqual(hd._getInternalAddressByIndex(0), 'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7');
    assert.ok(hd._getInternalAddressByIndex(0) !== hd._getInternalAddressByIndex(1));

    assert.ok(hd.getAllExternalAddresses().includes('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'));
    assert.ok(hd.getAllExternalAddresses().includes('bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh'));
    assert.ok(!hd.getAllExternalAddresses().includes('bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7')); // not internal
  });

  it('can generate', async () => {
    const hd = new HDTaprootWallet();
    const hashmap: Record<string, boolean> = {};
    for (let c = 0; c < 1000; c++) {
      await hd.generate();
      const secret = hd.getSecret();
      assert.strictEqual(secret.split(' ').length, 12);
      if (hashmap[secret]) {
        throw new Error('Duplicate secret generated!');
      }
      hashmap[secret] = true;
    }

    const hd2 = new HDTaprootWallet();
    hd2.setSecret(hd.getSecret());
    assert.ok(hd2.validateMnemonic());
  });

  it('derives correct xpub and addresses for zoo-glue mnemonic', async () => {
    const hd = new HDTaprootWallet();
    hd.setSecret(MNEMONIC);

    assert.strictEqual(true, hd.validateMnemonic());
    assert.strictEqual(
      'xpub6BigmXkLV9X2Rq3wMZFbQB7opPw68hfAvtYm9sGqHC7BY3KbUeh6sEptcMHiiTjXz5A62rd79b3ZfQcQaY31L1fSDEHd513v9pra6Bs4NNk',
      hd.getXpub(),
    );
    // cross-validate: ext_0 matches the utxos fixture address used in transaction tests
    assert.strictEqual(hd._getExternalAddressByIndex(0), 'bc1p4mc3hspc535vj2d9qcjmtynllv38u0lvfp8gs8npt64ejgtxszuq6t4ckj');
    assert.strictEqual(hd._getInternalAddressByIndex(0), 'bc1p5hgf9g8fy0m7ch20qe58wad632qhauq3t3hvf3gsz6ty54hw804qw24cxg');
  });

  describe('non-ASCII mnemonic wordlists', () => {
    it('validates a Japanese mnemonic instead of collapsing it to whitespace', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret(
        'あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あおぞら',
      );
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('validates a French mnemonic without stripping its accented characters', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret('exhaler filou sélectif zèbre jeton minéral féroce effrayer freiner fouiller estime ultrason');
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('still normalises stray punctuation and whitespace for an English mnemonic', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret('  Zoo, zoo,\tzoo\n zoo zoo zoo zoo zoo zoo zoo zoo GLUE  ');
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('does not let the English partial-word autocomplete corrupt an already-valid Spanish mnemonic', () => {
      // Spanish "luna" (moon) is an exact 4-letter prefix match for the English wordlist's
      // "lunar" — without a guard, setSecret's partial-word autocomplete step silently
      // rewrites it, corrupting an otherwise-valid Spanish mnemonic into an invalid one.
      const hd = new HDTaprootWallet();
      hd.setSecret('detalle árido mismo luna bufanda borrar alga duro detalle árido mismo luz');
      assert.strictEqual(hd.getSecret().includes('lunar'), false);
      assert.strictEqual(hd.validateMnemonic(), true);
    });
  });

  it('can createTransaction with a correct feerate', async () => {
    const hd = new HDTaprootWallet();
    hd.setSecret(MNEMONIC);
    assert.ok(hd.validateMnemonic());

    const targetFeeRate = 1;
    const { tx, psbt, outputs } = hd.createTransaction(
      utxos,
      [{ address: '13HaCAB4jf7FYSZexJxoczyDDnutzZigjS' }],
      targetFeeRate,
      hd._getInternalAddressByIndex(0),
    );

    assert.strictEqual(outputs.length, 1);
    assert(tx);

    const actualFeerate = Number(psbt.getFee()) / tx.virtualSize();
    assert.strictEqual(
      Math.round(actualFeerate) >= targetFeeRate && actualFeerate <= targetFeeRate + 1,
      true,
      `bad feerate, got ${actualFeerate}, expected at least ${targetFeeRate}; fee: ${psbt.getFee()}; vsize: ${tx.virtualSize()} vbytes; ${tx.toHex()}`,
    );

    assert.strictEqual(
      tx.toHex(),
      '02000000000101827bf236612645da4bd69fccb71e971188cdbb21f50eb530537c536627987fe90000000000000000800123c40200000000001976a91419129d53e6319baf19dba059bead166df90ab8f588ac0140328d4cf2587501acdbefa925818e881aa652f0d0e4680676186ab6dcaeaa497a5d10ac76f874037a44492a737222188ebb9097241b638a44b4f3203c313ff35a00000000',
    );
  });

  it('can createTransaction with a correct feerate 2', async () => {
    const hd = new HDTaprootWallet();
    hd.setSecret(MNEMONIC);
    assert.ok(hd.validateMnemonic());

    const targetFeeRate = 10;
    const { tx, psbt, outputs } = hd.createTransaction(
      utxos,
      [
        { address: 'bc1pgrhjjw52p6a03v635f7cnl6ttvuz9f34ujhaefm6xqtscd3m473szkl92g', value: 10000 },
        { address: 'bc1pm6lqlel3qxefsx0v39nshtghasvvp6ghn3e5hd5q280j5m9h7csqrkzssu', value: 10000 },
        { address: 'bc1ptestlpef53v6vyku3f9rk0ve2mek2fdwnd9k6q3mnyn6vs9nqlsqqnejxf', value: 10000 },
      ],
      targetFeeRate,
      hd._getInternalAddressByIndex(0),
    );

    assert.strictEqual(outputs.length, 4);
    assert(tx);

    const actualFeerate = Number(psbt.getFee()) / tx.virtualSize();
    assert.strictEqual(
      Math.round(actualFeerate) >= targetFeeRate && actualFeerate <= targetFeeRate + 1,
      true,
      `bad feerate, got ${actualFeerate}, expected at least ${targetFeeRate}; fee: ${psbt.getFee()}; virsualSize: ${tx.virtualSize()} vbytes; ${tx.toHex()}`,
    );
  });

  // coinselect sizes the change output it appends as a 25-byte P2PKH script; ours is a
  // 34-byte P2TR one, so the fee it reserves is 9 vbytes short of the transaction we build.
  describe('change output sizing', () => {
    const RECIPIENT = 'bc1pgrhjjw52p6a03v635f7cnl6ttvuz9f34ujhaefm6xqtscd3m473szkl92g';

    it('reserves a fee that covers the taproot change output it actually builds', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret(MNEMONIC);

      const targetFeeRate = 2;
      const { tx, fee, outputs } = hd.createTransaction(
        utxos,
        [{ address: RECIPIENT, value: 100000 }],
        targetFeeRate,
        hd._getInternalAddressByIndex(0),
      );

      assert.strictEqual(outputs.length, 2);
      assert(tx);
      assert.ok(fee >= tx.virtualSize() * targetFeeRate, `reserved ${fee} for ${tx.virtualSize()} vbytes at ${targetFeeRate} sat/vB`);
      assert.strictEqual(fee, 314); // 296 without the correction, against a 308 sat transaction
    });

    it('corrects the change output and not a custom script output', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret(MNEMONIC);

      const opReturn = { script: { hex: '6a0b68656c6c6f20776f726c64' }, value: 0 }; // OP_RETURN "hello world"
      const { inputs, outputs, fee } = hd.coinselect(utxos, [opReturn, { address: RECIPIENT, value: 50000 }], 2);

      // an addressless output with a script.hex is a custom script, not change
      assert.strictEqual(outputs.length, 3);
      assert.strictEqual(outputs[0].script?.hex, opReturn.script.hex);
      assert.strictEqual(outputs[1].address, RECIPIENT);
      assert.ok(!outputs[2].address && !outputs[2].script);
      assert.strictEqual(fee, 350); // 332 without the correction
      assert.strictEqual(inputs.reduce((sum, i) => sum + i.value, 0) - outputs.reduce((sum, o) => sum + o.value, 0), fee);
    });

    it('folds the change into the fee when correcting it would leave dust', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret(MNEMONIC);

      // leaves coinselect a 300 sat change; taking our 18 sats puts it under the 296 sat
      // dust threshold, so it is not worth creating at all
      const { inputs, outputs, fee } = hd.coinselect(utxos, [{ address: RECIPIENT, value: 180789 }], 2);

      assert.strictEqual(outputs.length, 1);
      assert.strictEqual(outputs[0].address, RECIPIENT);
      assert.strictEqual(fee, 596);
      assert.strictEqual(inputs.reduce((sum, i) => sum + i.value, 0) - outputs.reduce((sum, o) => sum + o.value, 0), fee);
    });
  });
});
