import type { TrackedRecord } from './records';
import { above } from './exercise-links';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A simple strict address: one @, no whitespace, no comma or semicolon, a domain with a dot. Same rule as the mail service. */
const ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
export const isEmail = (x: unknown): x is string => typeof x === 'string' && x.length <= 254 && ADDRESS.test(x);

/** How to reach the person: record kind `contact`, id `contact`, per profile. `email: null` means none. */
export type ContactBody = { email: string | null; weekly: boolean; atMs: number };
export const CONTACT_ID = 'contact';

/** The body of a `contact` record, or null for anything else. */
export function readContact(body: unknown): ContactBody | null {
  if (!isObj(body) || typeof body.atMs !== 'number' || !Number.isFinite(body.atMs) || typeof body.weekly !== 'boolean') return null;
  if (body.email !== null && !isEmail(body.email)) return null;
  return { email: body.email, weekly: body.weekly, atMs: body.atMs };
}

export const contactRecord = (c: Omit<ContactBody, 'atMs'>, nowMs: number, have?: TrackedRecord): TrackedRecord =>
  ({ kind: 'contact', id: CONTACT_ID, updatedMs: above(nowMs, have), deleted: false, body: { email: c.email, weekly: c.weekly, atMs: nowMs } });

/** The profile's contact; without a (readable) record: no address, no weekly mail. */
export function contactOf(records: readonly TrackedRecord[]): Omit<ContactBody, 'atMs'> {
  const r = records.find((x) => x.kind === 'contact' && x.id === CONTACT_ID && !x.deleted);
  const c = r ? readContact(r.body) : null;
  return c ? { email: c.email, weekly: c.weekly } : { email: null, weekly: false };
}
