import { SilentPayment } from 'silent-payments';

export const MAX_CONTACT_NAME_LENGTH = 50;

export type TContact = { name: string; createdAt: number };

export type TContacts = { [address: string]: TContact };

export type ContactListItem = TContact & { address: string };

export type ContactInput = { name: string; address: string; editingAddress?: string };

export type ContactError =
  | { field: 'name'; code: 'empty' }
  | { field: 'address'; code: 'empty' | 'invalid' }
  | { field: 'address'; code: 'duplicate'; conflictName: string };

export class ContactValidationError extends Error {
  readonly errors: ContactError[];

  constructor(errors: ContactError[]) {
    super('Invalid contact');
    this.name = 'ContactValidationError';
    this.errors = errors;
  }
}

/**
 * Silent payment addresses are bech32m, which is case-insensitive: the uppercase form of an
 * address decodes to the same payee. Normalizing before validating, keying and comparing is
 * what keeps the address usable as a primary key.
 */
export const normalizeAddress = (raw: string): string => raw.trim().toLowerCase();

export const isValidContactAddress = (addr: string): boolean => SilentPayment.isPaymentCodeValid(normalizeAddress(addr));

export const getContact = (contacts: TContacts, address: string): TContact | undefined => contacts[normalizeAddress(address)];

export const validateContact = (contacts: TContacts, input: ContactInput): ContactError[] => {
  const errors: ContactError[] = [];
  const name = input.name.trim();
  const address = normalizeAddress(input.address);
  const editingAddress = input.editingAddress === undefined ? undefined : normalizeAddress(input.editingAddress);

  if (name.length === 0) errors.push({ field: 'name', code: 'empty' });

  if (address.length === 0) {
    errors.push({ field: 'address', code: 'empty' });
  } else if (!isValidContactAddress(address)) {
    errors.push({ field: 'address', code: 'invalid' });
  } else {
    // A contact is never a duplicate of itself, or renaming one would report a collision
    // with the very record being edited.
    const conflict = address === editingAddress ? undefined : contacts[address];
    if (conflict) errors.push({ field: 'address', code: 'duplicate', conflictName: conflict.name });
  }

  return errors;
};

export const upsertContact = (contacts: TContacts, input: ContactInput): TContacts => {
  const errors = validateContact(contacts, input);
  if (errors.length > 0) throw new ContactValidationError(errors);

  const address = normalizeAddress(input.address);
  const editingAddress = input.editingAddress === undefined ? undefined : normalizeAddress(input.editingAddress);

  const next: TContacts = { ...contacts };

  // The address is the primary key, so changing it is a delete-then-insert. createdAt has to
  // travel to the new key or fixing a typo would silently reset the contact's age.
  const createdAt = (editingAddress === undefined ? undefined : next[editingAddress]?.createdAt) ?? Date.now();
  if (editingAddress !== undefined && editingAddress !== address) delete next[editingAddress];

  next[address] = { name: input.name.trim(), createdAt };
  return next;
};

export const removeContact = (contacts: TContacts, address: string): TContacts => {
  const next: TContacts = { ...contacts };
  delete next[normalizeAddress(address)];
  return next;
};

export const listContacts = (contacts: TContacts): ContactListItem[] =>
  Object.entries(contacts)
    .map(([address, contact]) => ({ address, ...contact }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

export const searchContacts = (list: ContactListItem[], query: string): ContactListItem[] => {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return list;
  return list.filter(c => c.name.toLowerCase().includes(needle) || c.address.includes(needle));
};

/**
 * Deserializes the `contacts` field of a storage bucket. Buckets written before this feature
 * have no such field, so a missing or malformed value reads as an empty map — that tolerance
 * is the whole migration path for existing installs.
 */
export const readContacts = (bucket: unknown): TContacts => {
  const raw = (bucket as { contacts?: unknown } | undefined)?.contacts;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: TContacts = {};
  for (const [address, value] of Object.entries(raw as Record<string, unknown>)) {
    const record = value as { name?: unknown; createdAt?: unknown } | null;
    if (typeof record?.name !== 'string') continue;
    out[normalizeAddress(address)] = {
      name: record.name,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
    };
  }
  return out;
};
