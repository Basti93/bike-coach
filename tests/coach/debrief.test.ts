import { cleanDebrief, DEBRIEF_TEXT_MAX, ruleDebrief } from '../../src/coach/debrief';
import type { RideSummary } from '../../src/coach/metrics';

const ride: RideSummary = {
  rideId: 'r1', startedAtMs: 1, status: 'finished', sessionId: 's', ftpW: 200, durationS: 2700,
  avgPowerW: 120, normalizedPowerW: 125, intensityFactor: 0.6, tss: 30, avgHrBpm: 122, maxHrBpm: 140, bestMinutePowerW: 150, completedFraction: 1,
};
const rule = ruleDebrief(ride, 1);
const answer = { summary: 'Ruhige Fahrt.', tips: ['a', 'b', 'c', 'd'], motivation: 'Gut gemacht.', questions: ['q1', 'q2', 'q3'] };

test('the rule version names duration and power and asks nothing', () => {
  const d = ruleDebrief(ride, 5);
  expect(d).toMatchObject({ rideId: 'r1', source: 'rules', atMs: 5, attempts: 0, questions: [] });
  expect(d.summary).toContain('45 Minuten');
  expect(d.summary).toContain('120 W');
});
test('the rule version leaves out values that were not measured', () => {
  const d = ruleDebrief({ ...ride, avgPowerW: null, avgHrBpm: null }, 5);
  expect(d.summary).not.toContain('null');
  expect(d.summary).not.toContain(' W');
});
test('an ended-early ride is not called complete', () => {
  expect(ruleDebrief({ ...ride, completedFraction: 0.4 }, 5).summary).toContain('40 %');
  expect(ruleDebrief(ride, 5).summary).not.toContain('%');
});
test('cleaning keeps at most 3 tips and 2 questions', () => {
  const d = cleanDebrief(answer, rule, 9, 1, (t) => t)!;
  expect(d).toMatchObject({ source: 'claude', atMs: 9, attempts: 1 });
  expect(d.tips).toEqual(['a', 'b', 'c']);
  expect(d.questions).toEqual(['q1', 'q2']);
});
test('cleaning shortens long text', () => {
  const d = cleanDebrief({ ...answer, summary: 'x'.repeat(5000) }, rule, 9, 1, (t) => t)!;
  expect(d.summary.length).toBe(DEBRIEF_TEXT_MAX);
});
test('cleaning drops dishonest text and keeps the rule text instead', () => {
  const d = cleanDebrief(answer, rule, 9, 1, (t) => (t === 'a' || t === 'Ruhige Fahrt.' ? null : t))!;
  expect(d.summary).toBe(rule.summary);
  expect(d.tips).toEqual(['b', 'c', 'd']);
});
test('an answer with nothing usable is no answer', () => {
  expect(cleanDebrief({ summary: ' ', tips: [], motivation: '', questions: ['q'] }, rule, 9, 1, (t) => t)).toBeNull();
});
