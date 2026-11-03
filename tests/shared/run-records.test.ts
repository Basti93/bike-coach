import { describe, expect, it } from 'vitest';
import { RECORD_KINDS } from '../../src/shared/records';
import { manualRunId, readRunBody, runFp, runIdType, runReviewId, runSendId, runWeekId, RUN_SETTINGS_ID, RUN_STATUS_ID, weekFp, type PlannedRun } from '../../src/shared/run';
import { validBody } from '../../src/web/validate';

const planned: PlannedRun = { date: '2026-11-03', kind: 'easy', minutes: 30, hrCap: 140, counts: 'x', note: null };
const week = { type: 'week', week: '2026-11-02', announce: true, atMs: 1, phase: 1, source: 'rules', reason: 'r', note: null, runs: [{ ...planned, fp: runFp(planned), done: null }], garmin: { status: 'none', reason: null, confirmedMs: null, sent: { '2026-11-03': { workoutId: 'w', scheduleId: null, fp: 'f' } } } };
const bodies = [
  week,
  { type: 'settings', on: true, weekdays: [1, 3, 5], answers: { runsPerWeek: 3, usualMinutes: 30, pain: false } },
  { type: 'manual', startMs: 1, durationS: 1800, distanceM: 5000, avgHr: null, runType: 'running' },
  { type: 'send', week: '2026-11-02', fp: 'f', atMs: 1 },
  { type: 'status', atMs: 1, on: true, suggest: false, needsAnswers: false, suggestedDays: [1], hrCap: 140, complaint: null,
    numbers: { easyPace: { now: 6, weeks4: null, weeks12: null, trend: [6, null] }, weeks: [{ week: '2026-11-02', km: 10, minutes: 60, plannedMinutes: null }], longest: { blockKm: null, lastBlockKm: null }, tests: [{ date: '2026-10-01', distanceM: 5000 }] },
    card: { runId: 'a', date: '2026-11-03', kind: 'unplanned', counted: 'c', result: 'r', sentence: 's' } },
  { type: 'review', week: '2026-11-02', atMs: 1, km: 10, minutes: 60, plannedMinutes: 70, runs: 2, longestKm: 6, easyPace: { now: 6, weeks4: null }, testM: null, focus: 'f' },
];

describe('run records', () => {
  it('readRunBody accepts each of the six body types', () => {
    for (const b of bodies) expect(readRunBody(b)?.type).toBe(b.type);
  });
  it('readRunBody rejects a week body with a bad week key, a negative minutes value and an unknown type', () => {
    expect(readRunBody({ ...week, week: '2026-11-03' })).toBeNull();
    expect(readRunBody({ ...week, runs: [{ ...week.runs[0], minutes: -1 }] })).toBeNull();
    expect(readRunBody({ type: 'nope' })).toBeNull();
    expect(readRunBody(null)).toBeNull();
    expect(readRunBody({ ...bodies[2], distanceM: NaN })).toBeNull();
  });
  it('runIdType maps week-, send-, review-, manual-, settings and status', () => {
    expect(runIdType(runWeekId('2026-11-02'))).toBe('week');
    expect(runIdType(runSendId('2026-11-02'))).toBe('send');
    expect(runIdType(runReviewId('2026-11-02'))).toBe('review');
    expect(runIdType(manualRunId('abc'))).toBe('manual');
    expect(runIdType(RUN_SETTINGS_ID)).toBe('settings');
    expect(runIdType(RUN_STATUS_ID)).toBe('status');
    expect(runIdType('week-2026-11-03')).toBeNull();
    expect(runIdType('junk')).toBeNull();
  });
  it("weekFp changes when one run's minutes change", () => {
    const a = [{ fp: runFp(planned) }, { fp: runFp({ ...planned, date: '2026-11-05' }) }];
    const b = [a[0]!, { fp: runFp({ ...planned, date: '2026-11-05', minutes: 31 }) }];
    expect(weekFp(a)).not.toBe(weekFp(b));
    expect(weekFp(a)).toBe(weekFp([...a]));
  });
  it("validBody('run', …) follows readRunBody", () => {
    for (const b of bodies) expect(validBody('run', b)).toBe(true);
    expect(validBody('run', { type: 'nope' })).toBe(false);
  });
  it('one kinds list includes run', () => {
    expect(RECORD_KINDS).toContain('run');
  });
});
