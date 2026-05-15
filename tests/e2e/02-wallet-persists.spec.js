import { helperCreateWallet, launchAppForE2E } from './helperz';

describe('Wallet persistence', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
    await helperCreateWallet();
  });

  it('keeps the wallet across an app restart', async () => {
    await launchAppForE2E({ delete: false });
    await waitFor(element(by.id('HomeScreenReceiveButton')))
      .toBeVisible()
      .withTimeout(15_000);
  });
});
