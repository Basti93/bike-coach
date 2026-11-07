import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanSeen, adviceKey, weekPlanKey } from '../../../src/coach/chat/plan-seen';
import type { TrackedRecord } from '../../../src/shared/records';

const plan = (id: string, updatedMs: number, deleted = false): TrackedRecord => ({ kind: 'weekplan', id, updatedMs, deleted, body: {} });

test('the key changes when a plan is taken or replaced, not for deleted ones or the order', () => {
  expect(weekPlanKey([])).toBe('');
  expect(weekPlanKey([plan('2026-11-09', 2), plan('2026-11-02', 1)])).toBe(weekPlanKey([plan('2026-11-02', 1), plan('2026-11-09', 2)]));
  expect(weekPlanKey([plan('2026-11-02', 1)])).not.toBe(weekPlanKey([plan('2026-11-02', 3)]));
  expect(weekPlanKey([plan('2026-11-02', 1, true)])).toBe('');
});

test('a new key counts once, survives a restart, and no plan at all never counts', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seen-')), 'chat', 'plan-seen.json');
  const a = new PlanSeen(file);
  expect(a.changed('p', '')).toBe(false);
  expect(a.changed('p', 'k1')).toBe(true);
  expect(a.changed('p', 'k1')).toBe(false);
  expect(new PlanSeen(file).changed('p', 'k1')).toBe(false);
  expect(new PlanSeen(file).changed('p', 'k2')).toBe(true);
});

test('a date change that flips the advice counts once, the same advice never, the first sighting is quiet', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seen-')), 'chat', 'advice-seen.json');
  const seen = new PlanSeen(file);
  const day1 = adviceKey({ date: '2026-11-09', sport: 'gym', hardness: 'moderate', legs: true });
  const day2 = adviceKey({ date: '2026-11-10', sport: 'bike', hardness: 'easy' });
  expect(seen.changed('p', day1, true)).toBe(false);
  expect(seen.changed('p', day1, true)).toBe(false);
  expect(seen.changed('p', day2, true)).toBe(true);
  expect(seen.changed('p', day2, true)).toBe(false);
  expect(adviceKey({ date: '2026-11-10', sport: 'gym', hardness: 'easy', legs: false })).not.toBe(adviceKey({ date: '2026-11-10', sport: 'gym', hardness: 'easy', legs: true }));
});
