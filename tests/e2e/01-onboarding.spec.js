import { helperCreateWallet, launchAppForE2E } from './helperz';

describe('Onboarding', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
  });

  it('walks a fresh user from Onboarding to the home screen', async () => {
    await helperCreateWallet();
  });
});
