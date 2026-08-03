import assert from 'assert';
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

import { ShroudApp } from '../../class';
import { ContactsProvider } from '../../components/Context/ContactsProvider';
import { useContacts } from '../../hooks/context/useContacts';
import { useStorage } from '../../hooks/context/useStorage';

jest.mock('../../hooks/context/useStorage');

const mockUseStorage = useStorage as jest.Mock;
const shroudApp = ShroudApp.getInstance();

const ADDR_A = 'sp1qqfqnnv8czppwysafq3uwgwvsc638hc8rx3hscuddh0xa2yd746s7xqh6yy9ncjnqhqxazct0fzh98w7lpkm5fvlepqec2yy0sxlq4j6ccc3h6t0g';

describe('ContactsProvider', () => {
  beforeEach(() => {
    shroudApp.contacts = {};
    mockUseStorage.mockReturnValue({ saveToDisk: jest.fn().mockResolvedValue(undefined), walletsInitialized: true });
  });

  const renderContacts = () =>
    renderHook(() => useContacts(), { wrapper: ({ children }) => <ContactsProvider>{children}</ContactsProvider> });

  it('syncs from the shroudApp singleton once wallets are initialized', () => {
    shroudApp.contacts = { [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000, colorIndex: 2 } };

    const { result } = renderContacts();

    assert.deepStrictEqual(result.current.contacts, { [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000, colorIndex: 2 } });
  });

  it('resetContacts re-syncs from the singleton after it is mutated directly', () => {
    shroudApp.contacts = { [ADDR_A]: { name: 'Anmol Sharma', createdAt: 1000, colorIndex: 2 } };
    const { result } = renderContacts();
    assert.notDeepStrictEqual(result.current.contacts, {});

    // Simulates createFakeStorage() blanking the singleton when switching to the
    // plausible-deniability decoy bucket, bypassing the provider's own setState.
    shroudApp.contacts = {};

    act(() => {
      result.current.resetContacts();
    });

    assert.deepStrictEqual(result.current.contacts, {});
    assert.deepStrictEqual(result.current.contactList, []);
  });
});
