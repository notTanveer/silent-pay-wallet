import { helperCreateWallet, launchAppForE2E } from './helperz';

describe('Send', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
    await helperCreateWallet();
  });

  it('navigates from home to the Send screen', async () => {
    await element(by.id('HomeScreenSendButton')).tap();
    await waitFor(element(by.id('chooseFee')))
      .toBeVisible()
      .withTimeout(15_000);
  });
});
