import { describe, expect, it } from 'vitest';
import { initialGymState } from '../../../src/coach/gym/state';
import { gymPublic } from '../../../src/coach/gym/public';

describe('gymPublic', () => {
  const state = initialGymState('p1');
  it('is null without a connection', () => {
    expect(gymPublic({ state: 'idle' }, state, false, true)).toBeNull();
    expect(gymPublic({ state: 'connecting' }, state, false, true)).toBeNull();
    expect(gymPublic({ state: 'failed', reason: 'invalid' }, state, false, true)).toBeNull();
  });
  it('carries state, thinking and ready for a connected profile, and never a key', () => {
    const g = gymPublic({ state: 'connected', workouts: 3, loading: false, lastSyncMs: 1 }, state, true, false);
    expect(g).toEqual({ state, thinking: true, ready: false });
    expect(JSON.stringify(g)).not.toMatch(/api-?key|"key"/i);
  });
});
