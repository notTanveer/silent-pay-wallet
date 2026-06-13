import assert from 'assert';
import { ECPairFactory } from 'ecpair';

import ecc from '../../modules/noble_ecc';

const h = (hex: string) => Buffer.from(hex, 'hex');

describe('ecc', () => {
  it('ECPair accepts noble', () => {
    const ECPair = ECPairFactory(ecc);
    assert.ok(ECPair);
  });

  it('works (basic)', () => {
    assert.ok(ecc.isPoint(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')));
    assert.ok(
      !ecc.isPoint(
        Buffer.from(
          '0100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001',
          'hex',
        ),
      ),
    );
    assert.ok(!ecc.isPoint(Buffer.from('00', 'hex')));

    const rez2 = ecc.privateAdd(
      h('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd036413e'),
      h('0000000000000000000000000000000000000000000000000000000000000003'),
    );
    assert.strictEqual(rez2, null);

    assert.ok(!ecc.isPrivate(h('0000000000000000000000000000000000000000000000000000000000000000')));
  });
});
