import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Coach, SYSTEM_PROMPT } from '../../src/coach/coach';
import { DEBRIEF_SYSTEM_PROMPT } from '../../src/coach/debrief';
import type { StrengthWorkout } from '../../src/coach/hevy';
import { strengthPromptData } from '../../src/coach/strength';
import type { Sample } from '../../src/shared/sample';
import type { Session } from '../../src/shared/session';

const DAY = 86_400_000;
const NOW = Date.parse('2027-06-15T12:00:00Z');
const workout = (daysAgo: number, id = `w${daysAgo}`): StrengthWorkout => ({
  id, title: 'Beine', startMs: NOW - daysAgo * DAY, durationS: 1800,
  exercises: [{ title: 'Kniebeuge', sets: 3, reps: 30, volumeKg: 1500 }, { title: 'Wadenheben', sets: 3, reps: 36, volumeKg: 900 }],
});

test('recent workouts are listed and older ones only summed', () => {
  const data = strengthPromptData([workout(2), workout(40), workout(41)], NOW) as { letzte14Tage: { tag: string; uebungen: unknown[] }[]; monate: { monat: string; anzahl: number; stunden: number; volumenKg: number }[] };
  expect(data.letzte14Tage).toHaveLength(1);
  expect(data.letzte14Tage[0].tag).toBe('2027-06-13');
  expect(data.letzte14Tage[0].uebungen[0]).toEqual({ name: 'Kniebeuge', saetze: 3, wdh: 30, volumenKg: 1500 });
  expect(data.monate).toEqual([{ monat: '2027-05', anzahl: 2, stunden: 1, volumenKg: 4800 }]);
});
test('the summary stays small with years of training', () => {
  const many = Array.from({ length: 2000 }, (_, i) => workout(i));
  expect(JSON.stringify(strengthPromptData(many, NOW)).length).toBeLessThan(4000);
});
test('very old months drop out', () => {
  const data = strengthPromptData([workout(900)], NOW) as { monate: unknown[] };
  expect(data.monate).toEqual([]);
});
test('no workouts means nothing to say', () => {
  expect(strengthPromptData([], NOW)).toBeNull();
});
test('the system prompts explain how to use it', () => {
  for (const p of [SYSTEM_PROMPT, DEBRIEF_SYSTEM_PROMPT]) expect(p).toContain('krafttraining');
});

describe('in the prompts', () => {
  const session: Session = { id: 'ki', name: 'KI', steps: [{ kind: 'erg', durationS: 1500, ftpFraction: 0.65, label: 'Locker' }] };
  const debrief = { summary: 's', tips: [], motivation: 'm', questions: [] };
  const run = async (strength?: (id: string) => StrengthWorkout[]) => {
    const rides = fs.mkdtempSync(path.join(os.tmpdir(), 'rides-'));
    const coachDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-'));
    const id = 'ride-1000';
    const start = NOW - 3600_000;
    fs.mkdirSync(path.join(rides, id));
    fs.writeFileSync(path.join(rides, id, 'meta.json'), JSON.stringify({ rideId: id, profileId: 'pa', sessionId: 'ki', startedAtMs: start, status: 'finished' }));
    fs.writeFileSync(path.join(rides, id, 'session.json'), JSON.stringify({ session, ftpW: 200 }));
    const lines = Array.from({ length: 1500 }, (_, i): Sample => ({ seq: i, wallClockMs: start + i * 1000, rideElapsedS: i + 1, powerW: 130, cadenceRpm: 90, speedKph: 30, hrBpm: 120, targetW: 130, gradePct: null, gear: null }));
    fs.writeFileSync(path.join(rides, id, 'samples.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const prompts: string[] = [];
    const coach = new Coach({ ridesDir: rides, coachDir, nowMs: () => NOW, ask: async (i) => { prompts.push(i.prompt); return debrief; }, ...(strength ? { strength } : {}) });
    coach.scanRides([{ id: 'pa', name: 'A', ftpW: 200 }]);
    await coach.ensureDebrief('pa');
    await coach.refresh('pa');
    return prompts;
  };
  test('both prompts carry it in a data block', async () => {
    const prompts = await run(() => [workout(2)]);
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    for (const p of prompts) {
      expect(p).toContain('<krafttraining-nur-daten>');
      expect(p).toContain('Kniebeuge');
    }
  });
  test('without Hevy nothing appears', async () => {
    for (const p of await run()) expect(p).not.toContain('krafttraining-nur-daten');
  });
  test('a person without workouts gets nothing either', async () => {
    for (const p of await run(() => [])) expect(p).not.toContain('krafttraining-nur-daten');
  });
  test('a failing source does not disturb the coach', async () => {
    const prompts = await run(() => { throw new Error('kaputt'); });
    expect(prompts.length).toBeGreaterThanOrEqual(2);
  });
});
test('another profile gets no strength data from this key', async () => {
  const seen: string[] = [];
  const coach = new Coach({ ridesDir: fs.mkdtempSync(path.join(os.tmpdir(), 'r-')), coachDir: fs.mkdtempSync(path.join(os.tmpdir(), 'c-')), nowMs: () => NOW, ask: async () => ({}), strength: (id) => { seen.push(id); return id === 'pa' ? [workout(1)] : []; } });
  const block = (coach as unknown as { strengthBlock: (id: string) => string }).strengthBlock.bind(coach);
  expect(block('pa')).toContain('Kniebeuge');
  expect(block('pb')).toBe('');
  expect(seen).toEqual(['pa', 'pb']);
});
