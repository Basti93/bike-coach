import { describe, expect, it, vi } from 'vitest';
import { createRestAlarms, REST_MAX_AHEAD_MS } from '../../web-server/rest-alarm';

function setup() {
  let t = 1_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  const fired: string[] = [];
  const alarms = createRestAlarms({
    now: () => t,
    setTimeout: ((fn: () => void, ms: number) => { const id = next++; timers.set(id, { at: t + ms, fn }); return id; }) as never,
    clearTimeout: ((id: number) => { timers.delete(id); }) as never,
    fire: (endpoint) => { fired.push(endpoint); },
  });
  const advance = (ms: number) => { t += ms; for (const [id, x] of [...timers]) if (x.at <= t) { timers.delete(id); x.fn(); } };
  return { alarms, timers, fired, advance, now: () => t };
}

describe('rest alarms', () => {
  it('fires once at the time for that endpoint', () => {
    const s = setup();
    expect(s.alarms.set('e1', s.now() + 5000)).toBe(true);
    s.advance(4999); expect(s.fired).toEqual([]);
    s.advance(1); expect(s.fired).toEqual(['e1']);
    s.advance(10_000); expect(s.fired).toEqual(['e1']);
  });
  it('a new alarm replaces the old one', () => {
    const s = setup();
    s.alarms.set('e1', s.now() + 5000);
    s.alarms.set('e1', s.now() + 9000);
    expect(s.timers.size).toBe(1);
    s.advance(5000); expect(s.fired).toEqual([]);
    s.advance(4000); expect(s.fired).toEqual(['e1']);
  });
  it('cancel and clearAll remove pending alarms', () => {
    const s = setup();
    s.alarms.set('e1', s.now() + 5000); s.alarms.set('e2', s.now() + 5000);
    s.alarms.cancel('e1'); expect(s.timers.size).toBe(1);
    s.alarms.clearAll(); expect(s.timers.size).toBe(0);
    s.advance(10_000); expect(s.fired).toEqual([]);
  });
  it('rejects past, now, too far and non-finite times and keeps the old alarm', () => {
    const s = setup();
    s.alarms.set('e1', s.now() + 5000);
    for (const bad of [s.now(), s.now() - 1, s.now() + REST_MAX_AHEAD_MS + 1, NaN, Infinity]) expect(s.alarms.set('e1', bad)).toBe(false);
    expect(s.timers.size).toBe(1);
    expect(s.alarms.set('e1', s.now() + REST_MAX_AHEAD_MS)).toBe(true);
  });
  it('uses the global timers by default', () => {
    vi.useFakeTimers();
    try {
      const fired: string[] = [];
      const a = createRestAlarms({ now: Date.now, fire: (e) => { fired.push(e); } });
      a.set('e', Date.now() + 1000);
      vi.advanceTimersByTime(1000);
      expect(fired).toEqual(['e']);
    } finally { vi.useRealTimers(); }
  });
});
