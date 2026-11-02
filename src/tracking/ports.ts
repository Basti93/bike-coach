import type { RecordKind, TrackedRecord } from '../shared/records';

/** The only way the tracking screens reach storage and sync. IndexedDB, Electron or a test fake sit behind it. */
export type TrackingPort = {
  list(kind: RecordKind): Promise<TrackedRecord[]>;
  /** Must apply `applyRecord` semantics (newer `updatedMs` wins, ties by JSON text) and must not blindly overwrite; callers raise `updatedMs` above what they saw. */
  put(r: TrackedRecord): Promise<void>;
  /** Fires after every local `put` and after every remote change that arrives. Listeners must tell the two apart by comparing `updatedMs`. */
  subscribe(fn: () => void): () => void;
  syncState(): { pending: number; lastOkMs: number | null };
};
