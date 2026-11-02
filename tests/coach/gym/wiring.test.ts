import { describe, expect, it } from 'vitest';
import { initialGymState } from '../../../src/coach/gym/state';
import { gymPublic } from '../../../src/coach/gym/public';

describe('gymPublic', () => {
  const state = initialGymState('p1');
  const extra = { complaints: [], hasHistory: true };
  it('is null without a connection', () => {
    expect(gymPublic({ state: 'idle' }, state, false, true, extra)).toBeNull();
    expect(gymPublic({ state: 'connecting' }, state, false, true, extra)).toBeNull();
    expect(gymPublic({ state: 'failed', reason: 'invalid' }, state, false, true, extra)).toBeNull();
  });
  it('carries state, thinking and ready for a connected profile, and never a key', () => {
    const g = gymPublic({ state: 'connected', workouts: 3, loading: false, lastSyncMs: 1 }, state, true, false, extra);
    expect(g).toEqual({ state, thinking: true, ready: false, complaints: [], hasHistory: true });
    expect(JSON.stringify(g)).not.toMatch(/api-?key|"key"/i);
  });
  it('hands on open complaints only', () => {
    const c = (id: string, status: 'active' | 'healing' | 'over') => ({ id, text: id, status, startedMs: 1, updatedMs: 1 });
    const g = gymPublic({ state: 'connected', workouts: 3, loading: false, lastSyncMs: 1 }, state, false, true, { complaints: [c('a', 'active'), c('b', 'healing'), c('d', 'over')], hasHistory: true });
    expect(g?.complaints.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
