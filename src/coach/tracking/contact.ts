import type { TrackedRecord } from '../../shared/records';
import { contactOf, type ContactBody } from '../../shared/contact';

type Reader = { all(profileId: string, kind?: 'contact'): TrackedRecord[] };

/** Read only: the coaches never write the person's address. Unreadable: no address, no mail. */
export function contactOfProfile(store: Reader, profileId: string): Omit<ContactBody, 'atMs'> {
  try { return contactOf(store.all(profileId, 'contact')); } catch { return contactOf([]); }
}
