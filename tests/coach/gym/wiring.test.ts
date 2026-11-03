import { describe, expect, it } from 'vitest';
import { initialGymState } from '../../../src/coach/gym/state';
import { gymPublic } from '../../../src/coach/gym/public';

describe('gymPublic', () => {
  const state = initialGymState('p1');
  const extra = { hevy: true, complaints: [], hasHistory: true };
  it('is null while the gym is not enabled', () => {
    expect(gymPublic(false, state, false, true, extra)).toBeNull();
  });
  it('carries state, thinking and ready for an enabled profile, and never a key', () => {
    const g = gymPublic(true, state, true, false, extra);
    expect(g).toEqual({ state, thinking: true, ready: false, hevy: true, complaints: [], hasHistory: true });
    expect(JSON.stringify(g)).not.toMatch(/api-?key|"key"/i);
  });
  it('hands on open complaints only', () => {
    const c = (id: string, status: 'active' | 'healing' | 'over') => ({ id, text: id, status, startedMs: 1, updatedMs: 1 });
    const g = gymPublic(true, state, false, true, { ...extra, complaints: [c('a', 'active'), c('b', 'healing'), c('d', 'over')] });
    expect(g?.complaints.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
