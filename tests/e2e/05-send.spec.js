import { helperCreateWallet, launchAppForE2E, waitForText } from './helperz';

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

  it('shows a validation alert on incomplete form and stays on send screen', async () => {
    await element(by.id('AddressInput')).replaceText('notanaddress');
    await element(by.text('Next')).tap();
    await waitForText('OK');
    await element(by.text('OK')).tap();
    await expect(element(by.id('AddressInput'))).toBeVisible();
  });
});
