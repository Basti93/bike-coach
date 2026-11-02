import type { RecordKind, TrackedRecord } from '../../src/shared/records';
import type { TrackingPort } from '../../src/tracking/ports';

export function fakePort(seed: TrackedRecord[] = []) {
  const map = new Map<string, TrackedRecord>(seed.map((r) => [`${r.kind}:${r.id}`, r]));
  const subs = new Set<() => void>();
  const state = { failPuts: false, pending: 0 };
  const port: TrackingPort = {
    list: async (kind: RecordKind) => [...map.values()].filter((r) => r.kind === kind),
    put: async (r) => { if (state.failPuts) throw new Error('disk'); map.set(`${r.kind}:${r.id}`, r); subs.forEach((s) => s()); },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    syncState: () => ({ pending: state.pending, lastOkMs: null }),
  };
  return { port, map, state };
}
