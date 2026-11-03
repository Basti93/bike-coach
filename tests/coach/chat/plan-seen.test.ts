import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanSeen, weekPlanKey } from '../../../src/coach/chat/plan-seen';
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
