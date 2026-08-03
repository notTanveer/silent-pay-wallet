import { SilentPayment } from 'silent-payments';

export const MAX_CONTACT_NAME_LENGTH = 50;

// Fixed tints; deliberately independent of the light/dark theme so a contact keeps one
// recognisable colour.
export const CONTACT_AVATAR_PALETTE: ReadonlyArray<{ background: string; text: string }> = [
  { background: '#D7C9FF', text: '#754CE8' },
  { background: '#E7F0FA', text: '#3B80F9' },
  { background: '#F9EFE6', text: '#C35E19' },
  { background: '#EBF5ED', text: '#65C366' },
  { background: '#F7E9EF', text: '#AA3F7E' },
];

export type TContact = { name: string; createdAt: number; colorIndex: number };

export type TContacts = { [address: string]: TContact };

export type ContactListItem = TContact & { address: string };

export type ContactInput = { name: string; address: string; editingAddress?: string; colorIndex?: number };

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

const paletteIndex = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < CONTACT_AVATAR_PALETTE.length ? value : undefined;

export const randomContactColorIndex = (): number => Math.floor(Math.random() * CONTACT_AVATAR_PALETTE.length);

/**
 * Derived from the address rather than the name so a rename keeps the colour the user
 * already associates with this contact.
 */
export const legacyContactColorIndex = (address: string): number => {
  const normalized = normalizeAddress(address);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 100000007;
  }
  return hash % CONTACT_AVATAR_PALETTE.length;
};

/**
 * Both validate and upsert start by trimming the name and normalizing the addresses. Doing it
 * in one place is what keeps them agreeing on what counts as "the same input".
 */
const normalizeInput = (input: ContactInput): ContactInput => ({
  name: input.name.trim(),
  address: normalizeAddress(input.address),
  editingAddress: input.editingAddress === undefined ? undefined : normalizeAddress(input.editingAddress),
});

export const validateContact = (contacts: TContacts, input: ContactInput): ContactError[] => {
  const errors: ContactError[] = [];
  const { name, address, editingAddress } = normalizeInput(input);

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

  const { name, address, editingAddress } = normalizeInput(input);
  const next: TContacts = { ...contacts };

  // The address is the primary key, so changing it is a delete-then-insert. createdAt has to
  // travel to the new key or fixing a typo would silently reset the contact's age.
  const previous = editingAddress === undefined ? undefined : next[editingAddress];
  const createdAt = previous?.createdAt ?? Date.now();
  const colorIndex = previous?.colorIndex ?? paletteIndex(input.colorIndex) ?? randomContactColorIndex();
  if (editingAddress !== undefined && editingAddress !== address) delete next[editingAddress];

  next[address] = { name, createdAt, colorIndex };
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
    const record = value as { name?: unknown; createdAt?: unknown; colorIndex?: unknown } | null;
    if (typeof record?.name !== 'string') continue;
    const normalized = normalizeAddress(address);
    out[normalized] = {
      name: record.name,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
      colorIndex: paletteIndex(record.colorIndex) ?? legacyContactColorIndex(normalized),
    };
  }
  return out;
};

export const contactInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 2)
    .map(word => word[0].toUpperCase())
    .join('');

/**
 * Shortened form for list rows. Deliberately longer than utils/transactionHelpers.ts's
 * shortenAddress (4+4): silent payment addresses share a long common bech32m prefix, so a
 * short preview would make most contacts indistinguishable from one another.
 */
export const truncateContactAddress = (address: string): string => `${address.slice(0, 8)}…${address.slice(-4)}`;
