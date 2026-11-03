import { applyRecord, type TrackedRecord } from '../shared/records';
import { keptCopy } from './kept-copy';

export type Refusal = { id: string; reason: string };
export const MAX_BATCH_RECORDS = 200;
export const MAX_BATCH_BYTES = 4_500_000;
const MAX_PAGES = 1000;

export type SyncCursors = {
  sent: number; received: number;
  /** The server database these cursors belong to. */
  generation?: string;
  /** The server was restored: everything here goes up again. `sent` stays, it still says what was really unsent. */
  resend?: boolean;
};

export type SyncOptions = {
  local: {
    changedSince(cursor: number): Promise<{ records: TrackedRecord[]; cursor: number }>;
    apply(r: TrackedRecord): Promise<void>;
    /** Preferred for pages: one load and one save. */
    applyMany?(rs: TrackedRecord[]): Promise<void>;
    /** A record born on this device during a sync (a kept copy). Default: `apply`. */
    put?(r: TrackedRecord): Promise<unknown>;
  };
  send: (rs: TrackedRecord[]) => Promise<{ refused: Refusal[] } | void>;
  fetchSince: (cursor: number) => Promise<{ records: TrackedRecord[]; cursor: number; more?: boolean; reset?: boolean; generation?: string }>;
  cursors: { get(): Promise<SyncCursors>; set(c: SyncCursors): Promise<void> };
  /** Checked before every request. False ends the run quietly; what is done stays done. */
  mayContinue?: () => boolean;
  /** Records the server refused. They stay in the local store; the queue moves on past them. */
  refused?: (r: Refusal[]) => void;
};

const encoder = new TextEncoder();
/** TextEncoder, not Buffer: this also runs in the browser. */
const bytes = (r: TrackedRecord): number => encoder.encode(JSON.stringify(r)).length + 1;

/** Splits into requests of at most 200 records and below about 5 MB. */
function batches(records: TrackedRecord[]): TrackedRecord[][] {
  const out: TrackedRecord[][] = [];
  let cur: TrackedRecord[] = [], size = 0;
  for (const r of records) {
    const n = bytes(r);
    if (cur.length > 0 && (cur.length >= MAX_BATCH_RECORDS || size + n > MAX_BATCH_BYTES)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += n;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/**
 * Sends, fetches, then sends what the fetch left to send. The send comes first so that the server sees a version that is
 * about to lose and keeps it; before a page replaces unsent work holding more confirmed sets, that work is written as a
 * kept copy. `sent` only moves at the very end, so a failed run finds the same unsent work again and repeats harmlessly.
 * Records that came from the server are not sent back. Throws on a failed request; the cursors then stay where they were.
 */
export async function syncRecords(opts: SyncOptions): Promise<{ refused: Refusal[] }> {
  const refused: Refusal[] = [];
  const may = () => opts.mayContinue?.() !== false;
  const cur = await opts.cursors.get();
  const fromServer = new Map<string, string>();
  const sentNow = new Map<string, string>();
  const key = (r: TrackedRecord) => `${r.kind}:${r.id}`;
  const putLocal = opts.local.put ?? opts.local.apply;

  /** Sends what changed since `floor`, except what this run already sent or received. Null when it may not continue. */
  const sendChanged = async (floor: number): Promise<number | null> => {
    const changed = await opts.local.changedSince(floor);
    const toSend = changed.records.filter((r) => { const t = JSON.stringify(r); return fromServer.get(key(r)) !== t && sentNow.get(key(r)) !== t; });
    for (const batch of batches(toSend)) {
      if (!may()) return null;
      const res = await opts.send(batch);
      if (res && Array.isArray(res.refused)) refused.push(...res.refused);
      for (const r of batch) sentNow.set(key(r), JSON.stringify(r));
    }
    return changed.cursor;
  };

  /** Unsent workouts of this device that this page is about to replace, as kept copies where they hold more sets. */
  const copiesFor = async (page: TrackedRecord[]): Promise<TrackedRecord[]> => {
    if (!page.some((r) => r.kind === 'workout')) return [];
    const unsent = new Map((await opts.local.changedSince(cur.sent)).records.filter((r) => fromServer.get(key(r)) !== JSON.stringify(r)).map((r) => [key(r), r]));
    return page.flatMap((r) => {
      const mine = unsent.get(key(r));
      if (!mine || applyRecord(mine, r).keep !== r) return [];
      const copy = keptCopy(mine, r);
      return copy ? [copy] : [];
    });
  };

  if (!may()) return { refused };
  if ((await sendChanged(cur.resend ? 0 : cur.sent)) === null) return { refused };

  for (let page = 0; page < MAX_PAGES; page++) {
    if (!may()) return { refused };
    const got = await opts.fetchSince(cur.received);
    if (got.generation !== undefined && got.generation !== cur.generation) {
      // Another database than the one the cursors count in (a restore). The very first contact has nothing to redo.
      const first = cur.generation === undefined && cur.sent === 0 && cur.received === 0;
      const wasAt = cur.received;
      cur.generation = got.generation;
      if (!first) { cur.resend = true; cur.received = 0; sentNow.clear(); }
      await opts.cursors.set({ ...cur });
      if (wasAt !== 0) continue; // that page was read from a cursor of the old database
    }
    if (got.records.length > 0) {
      // The copy first: if anything fails after this, the same copy is written again, the same text under the same id.
      for (const c of await copiesFor(got.records)) await putLocal(c);
      if (opts.local.applyMany) await opts.local.applyMany(got.records);
      else for (const r of got.records) await opts.local.apply(r);
      for (const r of got.records) fromServer.set(key(r), JSON.stringify(r));
    }
    // The server lost data and counts from the start again: everything here goes up again.
    if (got.reset) cur.resend = true;
    const advanced = got.cursor !== cur.received;
    cur.received = got.cursor;
    await opts.cursors.set({ ...cur });
    if (!got.more || (!advanced && !got.reset)) break;
  }

  if (!may()) return { refused };
  const sentTo = await sendChanged(cur.resend ? 0 : cur.sent);
  if (sentTo === null) return { refused };
  cur.sent = sentTo;
  cur.resend = false;
  await opts.cursors.set({ ...cur });
  if (refused.length > 0) opts.refused?.(refused);
  return { refused };
}
