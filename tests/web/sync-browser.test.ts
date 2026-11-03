import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncRecords } from '../../src/tracking/sync';

afterEach(() => vi.unstubAllGlobals());

describe('syncRecords in a browser', () => {
  it('uploads without Node globals (no Buffer)', async () => {
    vi.stubGlobal('Buffer', undefined);
    const sent: unknown[] = [];
    const r = { kind: 'workout' as const, id: 'w', updatedMs: 1, deleted: false, body: { t: 'Übung äöü' } };
    await syncRecords({
      cursors: { get: async () => ({ sent: 0, received: 0 }), set: async () => {} },
      local: { changedSince: async () => ({ records: [r], cursor: 1 }), apply: async () => {} },
      fetchSince: async () => ({ records: [], cursor: 0 }),
      send: async (rs) => { sent.push(...rs); },
    });
    expect(sent).toEqual([r]);
  });
});
