import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Coach, SYSTEM_PROMPT, DEBRIEF_MAX_ATTEMPTS, DEBRIEF_MAX_AGE_MS, DEBRIEF_RETRY_MS } from '../../src/coach/coach';
import { ClaudeError } from '../../src/coach/claude-client';
import { DEBRIEF_SYSTEM_PROMPT } from '../../src/coach/debrief';
import type { Sample } from '../../src/shared/sample';
import type { Session } from '../../src/shared/session';

const NOW = 100 * 86_400_000;
const A = { id: 'pa', name: 'Max', ftpW: 200 };
const session: Session = { id: 'ki', name: 'KI', steps: [{ kind: 'erg', durationS: 1500, ftpFraction: 0.65, label: 'Locker' }] };
const good = { summary: 'Ruhig gefahren.', tips: ['Weiter so.'], motivation: 'Gut gemacht.', questions: ['Wie ging es den Knien?'] };
let rides: string; let coachDir: string; let now: number; let n: number;
beforeEach(() => {
  rides = fs.mkdtempSync(path.join(os.tmpdir(), 'rides-'));
  coachDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-'));
  now = NOW; n = 0;
});
const ride = (startedAtMs = now - 3600_000): string => {
  const rideId = `ride-${1000 + n++}`;
  fs.mkdirSync(path.join(rides, rideId));
  fs.writeFileSync(path.join(rides, rideId, 'meta.json'), JSON.stringify({ rideId, profileId: 'pa', sessionId: 'ki', startedAtMs, status: 'finished' }));
  fs.writeFileSync(path.join(rides, rideId, 'session.json'), JSON.stringify({ session, ftpW: 200 }));
  const lines = Array.from({ length: 1500 }, (_, i): Sample => ({ seq: i, wallClockMs: startedAtMs + i * 1000, rideElapsedS: i + 1, powerW: 130, cadenceRpm: 90, speedKph: 30, hrBpm: 120, targetW: 130, gradePct: null, gear: null }));
  fs.writeFileSync(path.join(rides, rideId, 'samples.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return rideId;
};
const setup = (ask: (i: { prompt: string }) => Promise<unknown>) => {
  const spy = vi.fn(ask);
  const coach = new Coach({ ridesDir: rides, coachDir, nowMs: () => now, ask: spy });
  coach.scanRides([A]);
  return { coach, ask: spy };
};

test('the latest ride gets a rule debrief first, then the AI one', async () => {
  const id = ride();
  let release = (_: unknown) => {};
  const { coach } = setup(() => new Promise((r) => { release = r; }));
  const run = coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]?.source).toBe('rules');
  expect(coach.state('pa').debriefToShow).toBe(id);
  expect(coach.isDebriefing('pa')).toBe(true);
  release(good);
  await run;
  expect(coach.state('pa').debriefs?.[id]).toMatchObject({ source: 'claude', summary: 'Ruhig gefahren.', attempts: 1 });
  expect(coach.isDebriefing('pa')).toBe(false);
});
test('a ride that was already rated is still shown once', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  coach.feedback('pa', id, 'right');
  expect(coach.state('pa').awaitingFeedback).toBeNull();
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefToShow).toBe(id);
  coach.debriefSeen('pa');
  expect(coach.state('pa').debriefToShow).toBeNull();
  expect(coach.state('pa').debriefs?.[id]).toBeTruthy();
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefToShow).toBeNull();
});
test('rating the ride puts the debrief away too', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  coach.feedback('pa', id, 'right');
  expect(coach.state('pa').debriefToShow).toBeNull();
});
test('skipping the rating puts the debrief away too', async () => {
  ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  coach.skipFeedback('pa');
  expect(coach.state('pa').debriefToShow).toBeNull();
});
test('a ride older than 48 hours gets no debrief and no AI call', async () => {
  ride(now - DEBRIEF_MAX_AGE_MS - 1);
  const { coach, ask } = setup(async () => good);
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs ?? {}).toEqual({});
  expect(ask).not.toHaveBeenCalled();
});
test('only the newest ride gets one', async () => {
  const old = ride(now - 7200_000);
  const latest = ride(now - 3600_000);
  const { coach, ask } = setup(async () => good);
  await coach.ensureDebrief('pa');
  expect(Object.keys(coach.state('pa').debriefs ?? {})).toEqual([latest]);
  expect(coach.state('pa').debriefs?.[old]).toBeUndefined();
  expect(ask).toHaveBeenCalledTimes(1);
});
test('an AI failure keeps the rule version, waits and stops after 3 attempts', async () => {
  const id = ride();
  const { coach, ask } = setup(async () => { throw new ClaudeError('failed', 'nein'); });
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]).toMatchObject({ source: 'rules', attempts: 1 });
  await coach.ensureDebrief('pa');
  expect(ask).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 5; i++) { now += DEBRIEF_RETRY_MS; await coach.ensureDebrief('pa'); }
  expect(ask).toHaveBeenCalledTimes(DEBRIEF_MAX_ATTEMPTS);
});
test('the attempts survive a restart', async () => {
  const id = ride();
  const { coach } = setup(async () => { throw new ClaudeError('failed', 'nein'); });
  await coach.ensureDebrief('pa');
  const again = setup(async () => good);
  expect(again.coach.state('pa').debriefs?.[id]?.attempts).toBe(1);
});
test('an invalid answer keeps the rule version', async () => {
  const id = ride();
  const { coach } = setup(async () => ({ nope: true }));
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]?.source).toBe('rules');
});
test('a text with an invented watt figure is dropped', async () => {
  const id = ride();
  const { coach } = setup(async () => ({ ...good, summary: 'Du hattest 999 W im Schnitt.' }));
  await coach.ensureDebrief('pa');
  const d = coach.state('pa').debriefs?.[id];
  expect(d).toMatchObject({ source: 'claude', motivation: 'Gut gemacht.' });
  expect(d?.summary).not.toContain('999');
  expect(d?.summary).toContain('Minuten');
});
test('answering a question stores a note, removes the question and asks for a new plan', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  coach.feedback('pa', id, 'right');
  const before = coach.state('pa').notes.length;
  coach.answerDebrief('pa', id, 'Wie ging es den Knien?', 'Gut');
  const s = coach.state('pa');
  expect(s.notes.length).toBe(before + 1);
  expect(s.notes.at(-1)?.text).toBe('Rückfrage: Wie ging es den Knien? Antwort: Gut');
  expect(s.debriefs?.[id]?.questions).toEqual([]);
  expect(s.dirty).toBe(true);
});
test('skipping a question stores nothing', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  const before = coach.state('pa').notes.length;
  coach.skipDebriefQuestion('pa', id, 'Wie ging es den Knien?');
  expect(coach.state('pa').notes.length).toBe(before);
  expect(coach.state('pa').debriefs?.[id]?.questions).toEqual([]);
});
test('a debrief failure leaves the plan alone', async () => {
  ride();
  const { coach } = setup(async () => { throw new ClaudeError('limit', 'Limit'); });
  const before = coach.state('pa');
  const { next, dirty, lastError } = before;
  await coach.ensureDebrief('pa');
  expect(coach.state('pa')).toMatchObject({ next, dirty, lastError });
});
test('the prompt carries the ride, its motives as data and no instructions from them', async () => {
  ride();
  const { coach, ask } = setup(async () => good);
  coach.state('pa').motives = [{ atMs: 1, text: 'Für die Berge', questionId: 'q' }] as never;
  await coach.ensureDebrief('pa');
  const prompt = String(ask.mock.calls[0][0].prompt);
  expect(prompt).toContain('Für die Berge');
  expect(prompt).toContain('nur-daten');
  expect(prompt).toContain('"sessionName"');
});
test('the prompt carries the long-term picture, like planning does', async () => {
  ride(now - 10 * 86_400_000);
  ride();
  const garmin = () => ({ days: [], activities: [], body: null });
  const ask = vi.fn(async (_: { prompt: string }) => good);
  const coach = new Coach({ ridesDir: rides, coachDir, nowMs: () => now, ask, garmin });
  coach.scanRides([A]);
  await coach.ensureDebrief('pa');
  const prompt = String(ask.mock.calls[0][0].prompt);
  for (const key of ['"belastung"', '"aktuellePhase"', '"ftpVerlauf"', '"fruehereFahrten"', '"garmin"']) expect(prompt).toContain(key);
});
test('a single small value does not become a tip', () => {
  expect(DEBRIEF_SYSTEM_PROMPT).toContain('hrDriftPct');
  expect(DEBRIEF_SYSTEM_PROMPT).toContain('mehrere Fahrten');
});
test('naming the body in the question does not turn a fine answer into a complaint', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  coach.answerDebrief('pa', id, 'Wie ging es den Knien?', 'Gut');
  expect(coach.state('pa').complaints ?? []).toEqual([]);
});
test('a real complaint in the answer still counts', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  await coach.ensureDebrief('pa');
  coach.answerDebrief('pa', id, 'Wie war es?', 'Das Knie tut weh');
  expect(coach.state('pa').complaints?.[0]).toMatchObject({ status: 'active', text: 'Das Knie tut weh' });
});
test('an empty AI answer keeps the rule version and counts as a failed attempt', async () => {
  const id = ride();
  const { coach, ask } = setup(async () => ({ summary: '', tips: [], motivation: ' ', questions: [] }));
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]).toMatchObject({ source: 'rules', attempts: 1 });
  now += DEBRIEF_RETRY_MS;
  await coach.ensureDebrief('pa');
  expect(ask).toHaveBeenCalledTimes(2);
});
test('a true value from the power curve is not treated as invented', async () => {
  const id = ride();
  const { coach } = setup(async () => good);
  const best = coach.state('pa').summaries[0].powerCurve!;
  coach.state('pa').summaries[0].powerCurve = { ...best, 300: 187 };
  const again = new Coach({ ridesDir: rides, coachDir, nowMs: () => now, ask: async () => ({ ...good, summary: 'Deine besten 5 Minuten lagen bei 187 W.' }) });
  (again as unknown as { states: Map<string, unknown> }).states.set('pa', coach.state('pa'));
  await again.ensureDebrief('pa');
  expect(again.state('pa').debriefs?.[id]?.summary).toContain('187 W');
});
test('long text is kept up to the debrief limit', async () => {
  const id = ride();
  const { coach } = setup(async () => ({ ...good, summary: 'x'.repeat(500) }));
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]?.summary.length).toBe(500);
});
test('rating while the coach still writes brings the AI version up once', async () => {
  const id = ride();
  let release = (_: unknown) => {};
  const { coach } = setup(() => new Promise((r) => { release = r; }));
  const run = coach.ensureDebrief('pa');
  coach.feedback('pa', id, 'right');
  expect(coach.state('pa').debriefToShow).toBeNull();
  release(good);
  await run;
  expect(coach.state('pa').debriefToShow).toBe(id);
});
test('disconnecting from Garmin switches uploading off', () => {
  ride();
  const { coach } = setup(async () => good);
  coach.setUploadMode('pa', 'ask');
  coach.garminDisconnected('pa');
  expect(coach.state('pa').garminUpload).toMatchObject({ mode: 'off' });
});
test('without Garmin the debrief works and its prompt has no empty section', async () => {
  const id = ride();
  const { coach, ask } = setup(async () => good);
  await coach.ensureDebrief('pa');
  expect(coach.state('pa').debriefs?.[id]?.source).toBe('claude');
  expect(String(ask.mock.calls[0][0].prompt)).not.toContain('"garmin"');
});
test('the coach is told to use simple session names', () => {
  expect(SYSTEM_PROMPT).toContain('Name der Einheit');
  expect(SYSTEM_PROMPT).toContain('Locker, 30 Minuten');
});
