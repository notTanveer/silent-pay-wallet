import assert from 'assert';

import { HDTaprootWallet } from '../../class';

// AbstractHDWallet.setSecret is inherited by every HD wallet type (HDTaprootWallet →
// AbstractHDElectrumWallet → AbstractHDWallet); there is no override anywhere in
// class/wallets/. HDTaprootWallet is used here only as a convenient concrete subclass.
describe('AbstractHDWallet.setSecret', () => {
  describe('non-ASCII mnemonic wordlists', () => {
    it('validates a Japanese mnemonic instead of collapsing it to whitespace', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret(
        'あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あいこくしん　あおぞら',
      );
      assert.strictEqual(hd.getSecret(), 'あいこくしん '.repeat(11) + 'あおぞら');
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('validates a French mnemonic without stripping its accented characters', () => {
      const mnemonic = 'exhaler filou sélectif zèbre jeton minéral féroce effrayer freiner fouiller estime ultrason';
      const hd = new HDTaprootWallet();
      hd.setSecret(mnemonic);
      assert.strictEqual(hd.getSecret(), mnemonic);
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('still normalises stray punctuation and whitespace for an English mnemonic', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret('  Zoo, zoo,\tzoo\n zoo zoo zoo zoo zoo zoo zoo zoo GLUE  ');
      assert.strictEqual(hd.getSecret(), 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo glue');
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('does not let the English partial-word autocomplete corrupt an already-valid Spanish mnemonic', () => {
      // Spanish "luna" (moon) is an exact 4-letter prefix match for the English wordlist's
      // "lunar" — without a guard, setSecret's partial-word autocomplete step silently
      // rewrites it, corrupting an otherwise-valid Spanish mnemonic into an invalid one.
      const mnemonic = 'detalle árido mismo luna bufanda borrar alga duro detalle árido mismo luz';
      const hd = new HDTaprootWallet();
      hd.setSecret(mnemonic);
      assert.strictEqual(hd.getSecret(), mnemonic);
      assert.strictEqual(hd.validateMnemonic(), true);
    });

    it('protects a valid Spanish word even when another word in the same phrase is a typo', () => {
      // A phrase-level "is the whole thing already valid?" guard only protects mnemonics
      // that need no help at all: one mistyped word ("deta" instead of "detalle") makes the
      // phrase invalid overall, which would re-trigger autocomplete against the English
      // wordlist and still rewrite the unrelated, correctly-typed "luna" into "lunar". The
      // guard has to be per-word so a typo elsewhere can't corrupt a word that's already valid.
      const hd = new HDTaprootWallet();
      hd.setSecret('deta árido mismo luna bufanda borrar alga duro detalle árido mismo luz');
      assert.strictEqual(hd.getSecret(), 'detail árido mismo luna bufanda borrar alga duro detalle árido mismo luz');
      assert.strictEqual(hd.validateMnemonic(), false);
    });
  });

  describe('English partial-word autocomplete', () => {
    it('still completes partial English words to their unique wordlist match', () => {
      const hd = new HDTaprootWallet();
      hd.setSecret('aban aban aban aban aban aban aban aban aban aban aban abou');
      assert.strictEqual(hd.getSecret(), 'abandon '.repeat(11) + 'about');
      assert.strictEqual(hd.validateMnemonic(), true);
    });
  });
});
