import type { RecordKind, TrackedRecord } from '../shared/records';

/** The only way the tracking screens reach storage and sync. IndexedDB, Electron or a test fake sit behind it. */
export type TrackingPort = {
  list(kind: RecordKind): Promise<TrackedRecord[]>;
  put(r: TrackedRecord): Promise<void>;
  subscribe(fn: () => void): () => void;
  syncState(): { pending: number; lastOkMs: number | null };
};
