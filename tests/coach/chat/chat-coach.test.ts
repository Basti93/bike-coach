import { ChatCoach } from '../../../src/coach/chat/chat-coach';
import { ClaudeError } from '../../../src/coach/claude-client';
import { chatThread } from '../../../src/shared/chat';
import type { RecordKind, TrackedRecord } from '../../../src/shared/records';
import { weekDates } from '../../../src/shared/week-plan';

const NOW = new Date(2026, 10, 4, 18).getTime(); // Wednesday 2026-11-04
const store = (seed: TrackedRecord[] = []) => {
  const recs = new Map<string, TrackedRecord>(seed.map((r) => [`${r.kind}:${r.id}`, r]));
  return {
    all: (_id: string, kind: RecordKind) => [...recs.values()].filter((r) => r.kind === kind),
    put: (_id: string, r: TrackedRecord) => { recs.set(`${r.kind}:${r.id}`, r); return r; },
    recs,
  };
};
const rider = (id: string, text: string, atMs = NOW - 1000, extra = {}): TrackedRecord => ({ kind: 'chat', id, updatedMs: atMs, deleted: false, body: { role: 'rider', text, atMs, ...extra } });
const days = (monday: string, hard: number[] = [], legsHardOn: number | null = null) => weekDates(monday).map((date, i) => ({
  date, sport: i === legsHardOn ? 'gym' : hard.includes(i) ? 'bike' : 'rest', hardness: hard.includes(i) || i === legsHardOn ? 'hard' : 'easy', fixed: false, ...(i === legsHardOn ? { legs: true } : {}),
}));
let n = 0;
const coach = (s: ReturnType<typeof store>, ask: (p: { prompt: string }) => Promise<unknown>) =>
  new ChatCoach({ store: s as never, ask: ask as never, nowMs: () => NOW, newId: () => `c${++n}` });
const replies = (s: ReturnType<typeof store>) => chatThread([...s.recs.values()]).filter((m) => m.role === 'coach');

test('answers the waiting message once, with a valid proposal for this week', async () => {
  const s = store([rider('r1', '3× Rad diese Woche')]);
  const asks: string[] = [];
  const c = coach(s, async ({ prompt }) => { asks.push(prompt); return { text: 'So?', proposal: { weekStart: '2026-11-02', days: days('2026-11-02', [1, 3]) }, riderAskedForMore: false }; });
  expect(await c.tick('p')).toBe(true);
  expect(await c.tick('p')).toBe(false);
  const [m] = replies(s);
  expect(m).toMatchObject({ text: 'So?', replyTo: 'r1' });
  expect(m!.proposal?.weekStart).toBe('2026-11-02');
  expect(asks).toHaveLength(1);
  expect(asks[0]).toContain('3× Rad diese Woche');
});

test('a proposal that breaks a rule is asked again once, and dropped if still broken', async () => {
  const s = store([rider('r1', 'Plan')]);
  let calls = 0;
  const c = coach(s, async () => { calls++; return { text: 'Hier.', proposal: { weekStart: '2026-11-02', days: days('2026-11-02', [0, 2, 4]) }, riderAskedForMore: false }; });
  await c.tick('p');
  expect(calls).toBe(2);
  const [m] = replies(s);
  expect(m!.proposal).toBeUndefined();
  expect(m!.text).toContain('passte nicht zu unseren Regeln');
});

test('when the rider asks for more, the proposal stays with its warnings', async () => {
  const s = store([rider('r1', 'Ich will drei harte Tage')]);
  const c = coach(s, async () => ({ text: 'Viel, aber okay.', proposal: { weekStart: '2026-11-02', days: days('2026-11-02', [0, 2, 4]) }, riderAskedForMore: true }));
  await c.tick('p');
  expect(replies(s)[0]).toMatchObject({ warnings: ['Mehr als zwei harte Tage in der Woche.'] });
});

test('never with an open complaint, even when asked for more', async () => {
  const complaint: TrackedRecord = { kind: 'complaint', id: 'k', updatedMs: 1, deleted: false, body: { text: 'Knie zwickt', status: 'active', atMs: 1 } };
  const s = store([rider('r1', 'Ich will drei harte Tage'), complaint]);
  const c = coach(s, async () => ({ text: 'Hm.', proposal: { weekStart: '2026-11-02', days: days('2026-11-02', [0, 2, 4]) }, riderAskedForMore: true }));
  await c.tick('p');
  expect(replies(s)[0]!.proposal).toBeUndefined();
});

test('a proposal for another week is dropped, the text stays', async () => {
  const s = store([rider('r1', 'Plan')]);
  const c = coach(s, async () => ({ text: 'Weit voraus.', proposal: { weekStart: '2026-11-23', days: days('2026-11-23') }, riderAskedForMore: false }));
  await c.tick('p');
  expect(replies(s)[0]).toMatchObject({ text: 'Weit voraus.' });
  expect(replies(s)[0]!.proposal).toBeUndefined();
});

test('a limit or failure answers kindly and marks it failed; old and handled messages get nothing', async () => {
  const s = store([rider('r1', 'Hallo')]);
  await coach(s, async () => { throw new ClaudeError('limit', 'x'); }).tick('p');
  expect(replies(s)[0]).toMatchObject({ failed: true, replyTo: 'r1' });
  expect(replies(s)[0]!.text).toContain('Kontingent');
  const old = store([rider('r2', 'Hallo', NOW - 3 * 86_400_000)]);
  expect(await coach(old, async () => ({ text: 'x', proposal: null, riderAskedForMore: false })).tick('p')).toBe(false);
  const take = store([rider('r3', 'Übernommen', NOW, { takes: 'c0' })]);
  expect(await coach(take, async () => ({ text: 'x', proposal: null, riderAskedForMore: false })).tick('p')).toBe(false);
});

test('messages older than 90 days are deleted', async () => {
  const s = store([rider('old', 'alt', NOW - 91 * 86_400_000)]);
  await coach(s, async () => ({ text: 'x', proposal: null, riderAskedForMore: false })).tick('p');
  expect(s.recs.get('chat:old')!.deleted).toBe(true);
});

test('a complaint told in the chat is started, one said to be over is ended, and the coach turns careful at once', async () => {
  const s = store([rider('r1', 'Mein Knie zwickt, und die Schulter ist wieder gut')]);
  const list = [{ id: 'k1', text: 'Schulter', status: 'active' }];
  const added: string[] = [], ended: string[] = [];
  const c = new ChatCoach({
    store: s as never, nowMs: () => NOW, newId: () => `c${++n}`,
    complaints: () => list,
    addComplaint: (_id, text) => { added.push(text); list.push({ id: 'k2', text, status: 'active' }); },
    endComplaint: (_id, cid) => { ended.push(cid); list.find((x) => x.id === cid)!.status = 'over'; },
    ask: (async () => ({ text: 'Gute Besserung.', proposal: { weekStart: '2026-11-02', days: days('2026-11-02', [0, 2, 4]) }, riderAskedForMore: true, newComplaint: 'Knie zwickt', complaintsOver: ['k1', 'unknown'] })) as never,
  });
  await c.tick('p');
  expect(added).toEqual(['Knie zwickt']);
  expect(ended).toEqual(['k1']);
  // The new complaint makes it careful: the broken proposal stays out even though the rider asked for more.
  expect(replies(s)[0]!.proposal).toBeUndefined();
});
