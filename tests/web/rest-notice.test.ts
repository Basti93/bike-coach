import { describe, expect, it } from 'vitest';
import { closeRestNotices, REST_TAG } from '../../src/web/push';
import { notificationFor } from '../../src/web/swLogic';

describe('closeRestNotices', () => {
  it('closes the rest notices the worker showed, and only those', async () => {
    const asked: string[] = [];
    const closed: string[] = [];
    const reg = {
      getNotifications: async (o: { tag: string }) => { asked.push(o.tag); return [{ close: () => closed.push('a') }, { close: () => closed.push('b') }]; },
    };
    expect(await closeRestNotices(reg)).toBe(2);
    expect(asked).toEqual([REST_TAG]);
    expect(closed).toEqual(['a', 'b']);
  });

  it('uses the tag the worker gives a rest notice', () => {
    expect(notificationFor(JSON.stringify({ type: 'rest' })).options.tag).toBe(REST_TAG);
  });

  it('never throws when the browser cannot list notifications', async () => {
    expect(await closeRestNotices({ getNotifications: async () => { throw new Error('no'); } })).toBe(0);
  });
});
