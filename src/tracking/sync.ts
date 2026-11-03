import type { TrackedRecord } from '../shared/records';

export type Refusal = { id: string; reason: string };
export const MAX_BATCH_RECORDS = 200;
export const MAX_BATCH_BYTES = 4_500_000;
const MAX_PAGES = 1000;

export type SyncOptions = {
  local: {
    changedSince(cursor: number): Promise<{ records: TrackedRecord[]; cursor: number }>;
    apply(r: TrackedRecord): Promise<void>;
    /** Preferred for pages: one load and one save. */
    applyMany?(rs: TrackedRecord[]): Promise<void>;
  };
  send: (rs: TrackedRecord[]) => Promise<{ refused: Refusal[] } | void>;
  fetchSince: (cursor: number) => Promise<{ records: TrackedRecord[]; cursor: number; more?: boolean; reset?: boolean }>;
  cursors: { get(): Promise<{ sent: number; received: number }>; set(c: { sent: number; received: number }): Promise<void> };
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
 * Fetches, then sends. Cursors are stored after every page and after the send, so a failure resumes where it stopped.
 * Records that came from the server are not sent back. Throws on a failed request; the cursors then stay where they were.
 */
export async function syncRecords(opts: SyncOptions): Promise<{ refused: Refusal[] }> {
  const refused: Refusal[] = [];
  const may = () => opts.mayContinue?.() !== false;
  const cur = await opts.cursors.get();
  const fromServer = new Map<string, string>();
  const key = (r: TrackedRecord) => `${r.kind}:${r.id}`;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (!may()) return { refused };
    const got = await opts.fetchSince(cur.received);
    if (got.records.length > 0) {
      if (opts.local.applyMany) await opts.local.applyMany(got.records);
      else for (const r of got.records) await opts.local.apply(r);
      for (const r of got.records) fromServer.set(key(r), JSON.stringify(r));
    }
    // The server lost data and counts from the start again: everything here goes up again.
    if (got.reset) cur.sent = 0;
    const advanced = got.cursor !== cur.received;
    cur.received = got.cursor;
    await opts.cursors.set({ ...cur });
    if (!got.more || (!advanced && !got.reset)) break;
  }

  if (!may()) return { refused };
  const changed = await opts.local.changedSince(cur.sent);
  const toSend = changed.records.filter((r) => fromServer.get(key(r)) !== JSON.stringify(r));
  for (const batch of batches(toSend)) {
    if (!may()) return { refused };
    const res = await opts.send(batch);
    if (res && Array.isArray(res.refused)) refused.push(...res.refused);
  }
  cur.sent = changed.cursor;
  await opts.cursors.set({ ...cur });
  if (refused.length > 0) opts.refused?.(refused);
  return { refused };
}
