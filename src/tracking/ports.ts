import type { RecordKind, TrackedRecord } from '../shared/records';

/** What a write ended as: `kept` false means a newer record stayed, and `updatedMs` is that record's. */
export type PutResult = { kept: boolean; updatedMs: number };

/** The only way the tracking screens reach storage and sync. IndexedDB, Electron or a test fake sit behind it. */
export type TrackingPort = {
  list(kind: RecordKind): Promise<TrackedRecord[]>;
  /** Must apply `applyRecord` semantics (newer `updatedMs` wins, ties by JSON text) and must not blindly overwrite; callers raise `updatedMs` above what they saw. Reports what was kept. */
  put(r: TrackedRecord): Promise<PutResult>;
  /** Fires after every local `put` and after every remote change that arrives. Listeners must tell the two apart by comparing `updatedMs`. */
  subscribe(fn: () => void): () => void;
  /** `refused` counts records the other side did not accept; they stay safe on this device. */
  syncState(): { pending: number; lastOkMs: number | null; refused?: number };
};
