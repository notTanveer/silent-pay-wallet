import { dismissBackupReminderIfPresent, helperCreateWallet, launchAppForE2E } from './helperz';

describe('Send', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
    await helperCreateWallet();
  });

  it('shows zero-balance toast when tapping Send with no funds', async () => {
    await element(by.id('HomeScreenSendButton')).tap();
    await waitFor(element(by.id('ZeroBalanceToast')))
      .toBeVisible()
      .withTimeout(5_000);
  });

  it('navigates to Receive screen via toast Request button', async () => {
    await waitFor(element(by.id('ZeroBalanceToastRequestButton')))
      .not.toExist()
      .withTimeout(10_000);
    await element(by.id('HomeScreenSendButton')).tap();
    await waitFor(element(by.id('ZeroBalanceToastRequestButton')))
      .toBeVisible()
      .withTimeout(5_000);
    await element(by.id('ZeroBalanceToastRequestButton')).tap();
    await dismissBackupReminderIfPresent();
    await waitFor(element(by.id('ReceiveDetailsScrollView')))
      .toBeVisible()
      .withTimeout(15_000);
  });
});
