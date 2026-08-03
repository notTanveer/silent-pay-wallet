import assert from 'assert';

import {
  ContactValidationError,
  MAX_CONTACT_NAME_LENGTH,
  TContacts,
  getContact,
  isValidContactAddress,
  listContacts,
  normalizeAddress,
  readContacts,
  removeContact,
  searchContacts,
  upsertContact,
  validateContact,
} from '../../class/contacts';

const ADDR_A = 'sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g';
const ADDR_B = 'sp1qqvchcnrcqpdutxhpf57ptn3wajj0ymqxwzu9g6vj9uxx3wuvlykhyqh99hyh33y5593802pzw5rtw040zrw9f8re52tgcwngc5974w5evuufdy0m';

const withA = (): TContacts => ({ [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000 } });

describe('normalizeAddress', () => {
  it('trims surrounding whitespace', () => {
    assert.strictEqual(normalizeAddress(`  ${ADDR_A}  `), ADDR_A);
  });

  it('lowercases, because uppercase silent payment addresses are also valid bech32m', () => {
    assert.strictEqual(normalizeAddress(ADDR_A.toUpperCase()), ADDR_A);
  });
});

describe('isValidContactAddress', () => {
  it('accepts a silent payment address', () => {
    assert.strictEqual(isValidContactAddress(ADDR_A), true);
  });

  it('accepts an uppercase silent payment address', () => {
    assert.strictEqual(isValidContactAddress(ADDR_A.toUpperCase()), true);
  });

  it('rejects a plain on-chain address', () => {
    assert.strictEqual(isValidContactAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), false);
  });

  it('rejects garbage', () => {
    assert.strictEqual(isValidContactAddress('not-an-address'), false);
  });
});

describe('validateContact', () => {
  it('returns no errors for a valid new contact', () => {
    assert.deepStrictEqual(validateContact({}, { name: 'Lena', address: ADDR_B }), []);
  });

  it('reports an empty name', () => {
    const errors = validateContact({}, { name: '   ', address: ADDR_B });
    assert.deepStrictEqual(errors, [{ field: 'name', code: 'empty' }]);
  });

  it('reports an empty address', () => {
    const errors = validateContact({}, { name: 'Lena', address: '' });
    assert.deepStrictEqual(errors, [{ field: 'address', code: 'empty' }]);
  });

  it('reports an invalid address', () => {
    const errors = validateContact({}, { name: 'Lena', address: 'not-an-address' });
    assert.deepStrictEqual(errors, [{ field: 'address', code: 'invalid' }]);
  });

  it('reports a duplicate address with the conflicting name', () => {
    const errors = validateContact(withA(), { name: 'Someone Else', address: ADDR_A });
    assert.deepStrictEqual(errors, [{ field: 'address', code: 'duplicate', conflictName: 'Anmol Sharma' }]);
  });

  it('detects a duplicate across letter case', () => {
    const errors = validateContact(withA(), { name: 'Someone Else', address: ADDR_A.toUpperCase() });
    assert.deepStrictEqual(errors, [{ field: 'address', code: 'duplicate', conflictName: 'Anmol Sharma' }]);
  });

  it('does not flag a contact as a duplicate of itself when only the name changes', () => {
    const errors = validateContact(withA(), { name: 'Anmol S.', address: ADDR_A, editingAddress: ADDR_A });
    assert.deepStrictEqual(errors, []);
  });

  it('still flags a collision with a different contact while editing', () => {
    const contacts: TContacts = {
      [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000 },
      [ADDR_B]: { name: 'Lena Fischer', createdAt: 2000 },
    };
    const errors = validateContact(contacts, { name: 'Lena Fischer', address: ADDR_A, editingAddress: ADDR_B });
    assert.deepStrictEqual(errors, [{ field: 'address', code: 'duplicate', conflictName: 'Anmol Sharma' }]);
  });

  it('reports name and address problems together', () => {
    const errors = validateContact({}, { name: '', address: 'nope' });
    assert.strictEqual(errors.length, 2);
  });
});

describe('upsertContact', () => {
  it('adds a contact with a createdAt timestamp', () => {
    const before = Date.now();
    const next = upsertContact({}, { name: 'Lena Fischer', address: ADDR_B });
    assert.strictEqual(next[ADDR_B].name, 'Lena Fischer');
    assert.ok(next[ADDR_B].createdAt >= before);
  });

  it('trims the name and normalizes the address key', () => {
    const next = upsertContact({}, { name: '  Lena Fischer  ', address: `  ${ADDR_B.toUpperCase()}  ` });
    assert.strictEqual(next[ADDR_B].name, 'Lena Fischer');
  });

  it('does not mutate the input map', () => {
    const contacts = withA();
    upsertContact(contacts, { name: 'Lena', address: ADDR_B });
    assert.deepStrictEqual(Object.keys(contacts), [ADDR_A]);
  });

  it('keeps the key and createdAt when only the name changes', () => {
    const next = upsertContact(withA(), { name: 'Anmol S.', address: ADDR_A, editingAddress: ADDR_A });
    assert.deepStrictEqual(Object.keys(next), [ADDR_A]);
    assert.strictEqual(next[ADDR_A].name, 'Anmol S.');
    assert.strictEqual(next[ADDR_A].createdAt, 1000);
  });

  it('moves the record and preserves createdAt when the address changes', () => {
    const next = upsertContact(withA(), { name: 'Anmol Sharma', address: ADDR_B, editingAddress: ADDR_A });
    assert.strictEqual(next[ADDR_A], undefined);
    assert.strictEqual(next[ADDR_B].name, 'Anmol Sharma');
    assert.strictEqual(next[ADDR_B].createdAt, 1000);
  });

  it('throws ContactValidationError carrying the errors when input is invalid', () => {
    assert.throws(
      () => upsertContact({}, { name: '', address: 'nope' }),
      (err: unknown) => err instanceof ContactValidationError && err.errors.length === 2,
    );
  });
});

describe('removeContact', () => {
  it('removes the addressed contact and leaves the rest', () => {
    const contacts: TContacts = {
      [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000 },
      [ADDR_B]: { name: 'Lena Fischer', createdAt: 2000 },
    };
    const next = removeContact(contacts, ADDR_A.toUpperCase());
    assert.deepStrictEqual(Object.keys(next), [ADDR_B]);
    assert.strictEqual(Object.keys(contacts).length, 2);
  });
});

describe('getContact', () => {
  it('looks a contact up regardless of letter case', () => {
    assert.strictEqual(getContact(withA(), ADDR_A.toUpperCase())?.name, 'Anmol Sharma');
  });

  it('returns undefined for an unknown address', () => {
    assert.strictEqual(getContact(withA(), ADDR_B), undefined);
  });
});

describe('listContacts', () => {
  it('sorts by name, case-insensitively', () => {
    const contacts: TContacts = {
      [ADDR_A]: { name: 'yuki Tanaka', createdAt: 1000 },
      [ADDR_B]: { name: 'Anmol Sharma', createdAt: 2000 },
    };
    assert.deepStrictEqual(
      listContacts(contacts).map(c => c.name),
      ['Anmol Sharma', 'yuki Tanaka'],
    );
  });

  it('includes the address on each item', () => {
    assert.strictEqual(listContacts(withA())[0].address, ADDR_A);
  });
});

describe('searchContacts', () => {
  const list = listContacts({
    [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000 },
    [ADDR_B]: { name: 'Lena Fischer', createdAt: 2000 },
  });

  it('returns everything for an empty query', () => {
    assert.strictEqual(searchContacts(list, '   ').length, 2);
  });

  it('matches a name substring, case-insensitively', () => {
    assert.deepStrictEqual(
      searchContacts(list, 'sharma').map(c => c.name),
      ['Anmol Sharma'],
    );
  });

  it('matches an address substring', () => {
    assert.deepStrictEqual(
      searchContacts(list, ADDR_B.slice(0, 20)).map(c => c.name),
      ['Lena Fischer'],
    );
  });

  it('returns nothing when nothing matches', () => {
    assert.deepStrictEqual(searchContacts(list, 'zzzz'), []);
  });
});

describe('readContacts', () => {
  it('returns an empty map when the bucket has no contacts key (existing installs)', () => {
    assert.deepStrictEqual(readContacts({ wallets: [], tx_metadata: {} }), {});
  });

  it('returns an empty map for a malformed value', () => {
    assert.deepStrictEqual(readContacts({ contacts: 'nonsense' }), {});
    assert.deepStrictEqual(readContacts({ contacts: [] }), {});
    assert.deepStrictEqual(readContacts(undefined), {});
  });

  it('reads well-formed contacts and normalizes their keys', () => {
    const out = readContacts({ contacts: { [ADDR_A.toUpperCase()]: { name: 'Anmol Sharma', createdAt: 1000 } } });
    assert.deepStrictEqual(out, { [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000 } });
  });

  it('skips entries without a string name and defaults a missing createdAt', () => {
    const out = readContacts({
      contacts: {
        [ADDR_A]: { name: 42 },
        [ADDR_B]: { name: 'Lena Fischer' },
      },
    });
    assert.deepStrictEqual(out, { [ADDR_B]: { name: 'Lena Fischer', createdAt: 0 } });
  });
});

describe('MAX_CONTACT_NAME_LENGTH', () => {
  it('is 50', () => {
    assert.strictEqual(MAX_CONTACT_NAME_LENGTH, 50);
  });
});
