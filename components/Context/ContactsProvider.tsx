import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { ShroudApp } from '../../class';
import {
  ContactInput,
  ContactListItem,
  TContact,
  TContacts,
  getContact as getContactFrom,
  listContacts,
  removeContact,
  upsertContact,
} from '../../class/contacts';
import { useStorage } from '../../hooks/context/useStorage';

const shroudApp = ShroudApp.getInstance();

export interface ContactsContextType {
  contacts: TContacts;
  contactList: ContactListItem[];
  getContact: (address: string) => TContact | undefined;
  saveContact: (input: ContactInput) => Promise<void>;
  deleteContact: (address: string) => Promise<void>;
  resetContacts: () => void;
}

// @ts-ignore default value does not match the type, matching StorageContext's convention
export const ContactsContext = createContext<ContactsContextType>(undefined);

export const ContactsProvider = ({ children }: { children: React.ReactNode }) => {
  const { saveToDisk, walletsInitialized } = useStorage();
  const [contacts, setContacts] = useState<TContacts>({});

  // walletsInitialized is the signal that loadFromDisk has finished populating the singleton.
  useEffect(() => {
    if (walletsInitialized) setContacts(shroudApp.contacts);
  }, [walletsInitialized]);

  const persist = useCallback(
    async (next: TContacts) => {
      const previous = shroudApp.contacts;
      shroudApp.contacts = next;
      setContacts(next);
      try {
        // force=true: the unforced path early-returns when no wallets are loaded.
        await saveToDisk(true);
      } catch (error) {
        shroudApp.contacts = previous;
        setContacts(previous);
        throw error;
      }
    },
    [saveToDisk],
  );

  // Re-validates rather than trusting the caller, so a form and the provider cannot drift.
  const saveContact = useCallback(async (input: ContactInput) => persist(upsertContact(shroudApp.contacts, input)), [persist]);

  const deleteContact = useCallback(async (address: string) => persist(removeContact(shroudApp.contacts, address)), [persist]);

  // Mirrors StorageProvider's resetWallets(): re-syncs from the shroudApp singleton after an
  // operation that mutates it directly, such as createFakeStorage() switching to the
  // plausible-deniability decoy bucket. Without this, the real contact list would remain in
  // React state — and visible via the Contacts screen — after switching to decoy storage.
  const resetContacts = useCallback(() => {
    setContacts(shroudApp.contacts);
  }, []);

  const contactList = useMemo(() => listContacts(contacts), [contacts]);

  const getContact = useCallback((address: string) => getContactFrom(contacts, address), [contacts]);

  const value: ContactsContextType = useMemo(
    () => ({ contacts, contactList, getContact, saveContact, deleteContact, resetContacts }),
    [contacts, contactList, getContact, saveContact, deleteContact, resetContacts],
  );

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
};
