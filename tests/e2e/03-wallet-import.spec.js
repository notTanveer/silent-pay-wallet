import { helperImportWallet, launchAppForE2E } from './helperz';

const TEST_MNEMONIC = process.env.MNEMONIC_TEST;
const describeOrSkip = TEST_MNEMONIC ? describe : describe.skip;

describeOrSkip('Wallet import', () => {
  beforeAll(async () => {
    await launchAppForE2E({ delete: true });
  });

  it('imports a wallet from MNEMONIC_TEST and lands on home', async () => {
    await helperImportWallet(TEST_MNEMONIC);
  });
});
