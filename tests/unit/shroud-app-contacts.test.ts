import assert from 'assert';

import { ShroudApp } from '../../class/shroud-app';

describe('ShroudApp persistence', () => {
  it('round-trips tx_metadata through storage', async () => {
    const app = new ShroudApp();
    app.tx_metadata = { deadbeef: { memo: 'lunch' } };
    await app.saveToDisk();

    const reloaded = new ShroudApp();
    assert.strictEqual(await reloaded.loadFromDisk(), true);
    assert.deepStrictEqual(reloaded.tx_metadata, { deadbeef: { memo: 'lunch' } });
  });
});
