import { helperCreateWallet, launchAppForE2E } from './helperz';

describe('Settings', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
    await helperCreateWallet();
  });

  it('navigates through visible settings entries', async () => {
    await element(by.id('SettingsButton')).tap();
    await waitFor(element(by.id('CurrencyButton')))
      .toBeVisible()
      .withTimeout(10_000);

    await element(by.id('CurrencyButton')).tap();
    await device.pressBack();
    await waitFor(element(by.id('AboutButton')))
      .toBeVisible()
      .whileElement(by.id('SettingsScrollView'))
      .scroll(200, 'down');

    await element(by.id('AboutButton')).tap();
    await waitFor(element(by.id('AboutScrollView')))
      .toBeVisible()
      .withTimeout(5_000);
  });
});
