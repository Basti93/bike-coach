// Takes screenshots of all important states with mock data. Does not touch real data or devices.
// Usage: npm run build && npm run ui:shots -- <target folder>
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron, type Page } from 'playwright-core';
import { rampTest } from '../../src/coach/rules';
import { STARTER_SESSIONS } from '../../src/shared/starter-sessions';
import { MOBILITY_EXERCISES } from '../../src/coach/mobility/exercises';
import { initialGymState } from '../../src/coach/gym/state';
import os from 'node:os';
import { MealCoach } from '../../src/coach/meals/meal-coach';
import { itemKey, withEater, withItem } from '../../src/shared/meals';

const out = process.argv[2] ?? 'ui-shots';
fs.mkdirSync(out, { recursive: true });
const profiles = [{ id: 'pa', name: 'Max', ftpW: 210, maxHrBpm: 175 }, { id: 'pb', name: 'Lena', ftpW: 128 }];
const devices = { trainer: 'connected', hr: 'connected', clicker: 'searching' };
const session = STARTER_SESSIONS[1];
const engine = (over = {}) => ({ stepIndex: 1, stepRemainingS: 137, rideElapsedS: 743, targetW: 200, gradePct: null, gear: null, label: 'Hart', nextLabel: 'Erholung', secondsToNext: 137, autoReducedPct: 0, paused: false, ...over });
const latest = { powerW: 198, hrBpm: 152, cadenceRpm: 88, speedKph: 33 };
const ride = (over = {}) => ({ type: 'state', ride: { rideId: 'r', profileId: 'pa', sessionId: session.id, startedAtMs: Date.now() - 743000, status: 'open' }, session, engine: engine(), latest, devices, profiles, storageError: false, ...over });
const idle = (over = {}) => ride({ ride: null, session: null, engine: null, ...over });
const coach = (over = {}) => ({
  profileId: 'pa', ftpW: 210, ftpHistory: [{ atMs: Date.now() - 86400000 * 9, ftpW: 210, source: 'ramp' }],
  phase: { name: 'Grundlage', weeksLeft: 4, goal: 'Regelmäßig und gern fahren und eine solide Ausdauerbasis aufbauen' },
  ftpForecast: [{ weeksAhead: 4, ftpW: 212 }, { weeksAhead: 8, ftpW: 216 }, { weeksAhead: 12, ftpW: 220 }],
  next: { session: { id: 'ki', name: 'Lockere Grundlage', steps: [{ kind: 'erg', durationS: 480, ftpFraction: 0.5, label: 'Warmup' }, { kind: 'erg', durationS: 1620, ftpFraction: 0.65, label: 'Locker fahren' }, { kind: 'erg', durationS: 300, ftpFraction: 0.45, label: 'Ausrollen' }] }, reason: 'Der Rampentest vor zwei Tagen war eine ordentliche Belastung, deshalb passen jetzt 40 entspannte Minuten bei 65 % FTP gut.', source: 'claude' },
  changes: [{ atMs: Date.now() - 86400000 * 2, text: 'Rampentest: Deine FTP liegt jetzt bei 210 W.' }, { atMs: Date.now() - 3600000, text: 'Einheit etwas kürzer, weil das Knie zwickt.' }],
  notes: [{ atMs: Date.now() - 3600000, text: 'Knie zwickt etwas', reply: 'Danke für den Hinweis, heute bleibt es locker.' }],
  feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null, dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null, ...over,
});

const TOGETHER = {
  people: [{ profileId: 'pa', name: 'Max', ridesThisWeek: 2, minutesThisWeek: 75, streakWeeks: 3, wordsLearned: 14, weeks: [0, 0, 40, 60, 0, 30, 45, 0, 60, 90, 45, 75] }, { profileId: 'pb', name: 'Lena', ridesThisWeek: 3, minutesThisWeek: 90, streakWeeks: 4, wordsLearned: 21, weeks: [30, 0, 0, 45, 30, 0, 60, 30, 45, 60, 80, 90] }],
  recent: [{ name: 'Lena', startedAtMs: Date.now() - 3600000 * 20, sessionName: 'Locker, 30 Minuten', minutes: 30 }, { name: 'Max', startedAtMs: Date.now() - 86400000 * 2, sessionName: 'Intervalle, 45 Minuten', minutes: 45 }, { name: 'Lena', startedAtMs: Date.now() - 86400000 * 3, sessionName: 'Steigung, 40 Minuten', minutes: 40 }],
  metres: 2240, lastRideMetres: 300, summits: [{ name: 'Alpe d’Huez', atMs: Date.now() - 86400000 * 12 }], climbing: [{ who: 'Max', name: 'Mont Ventoux', pct: 42 }, { who: 'Lena', name: 'Alpe d’Huez', pct: 71 }], climbed: [{ who: 'Max', name: 'Brocken', atMs: Date.now() - 86400000 * 3 }], line: 'Lena legt diese Woche vor. Max, das Rad wartet schon.', peak: { name: 'Mont Ventoux', done: 1140, total: 1600, next: 'Stilfser Joch' },
};
const HEALTH = {
  points: Array.from({ length: 28 }, (_, i) => ({ date: new Date(Date.now() - (27 - i) * 86400000).toISOString().slice(0, 10), restingHrBpm: i % 11 === 5 ? null : 58 + Math.round(4 * Math.sin(i / 3)), vo2max: 51 + i * 0.02, sleepS: null, hrvMs: null, stressAvg: 25 + (i % 9), bodyBatteryMax: 70 + (i % 25), load: i % 5 === 0 ? 40 + i : null })),
  years: [{ jahr: '2026', sport: 'cycling', anzahl: 18, stunden: 21.5 }, { jahr: '2026', sport: 'running', anzahl: 22, stunden: 14.2 }, { jahr: '2025', sport: 'virtual_ride', anzahl: 28, stunden: 25 }],
  progress: { activities: 293, activitiesComplete: true, daysDone: 120, daysTotal: 2758, filesDone: 0, filesTotal: 293 }, pulseBeforeRides: null,
};
const GARMIN = {
  health: HEALTH,
  garminMsg: {
    garmin: { state: 'connected' }, garminSync: { running: false, lastRunMs: Date.now() - 3600000, complete: false, problem: null },
    garminReadiness: { level: 'careful', reasons: ['Ruhepuls seit 2 Tagen erhöht (66 statt um 60 bpm)'] },
    garminSuggestion: { birthDate: '1990-01-15', sex: 'male', heightCm: 178, weightKg: 72, activity: 3, run5kMin: 23.3, ftp: { startW: 145, source: 'estimate', capW: 183 }, maxHrBpm: 190, missing: [] },
  },
};

// Mobility: sessions made of the real exercise list, the way the service offers them (src/coach/mobility/mobility.ts).
const mobExercises = (ids: string[]) => ids.map((id) => { const e = MOBILITY_EXERCISES.find((x) => x.id === id); if (!e) throw new Error(`unknown mobility exercise ${id}`); return { id: e.id, title: e.title, howTo: e.howTo, area: e.area }; });
const BIKE_MOBILITY = { id: 'mobility-bike-1f3a9c', forSession: 'bike' as const, minutes: 8, reason: 'Nach der Fahrt tun Hüfte, Oberschenkel und Brust ein paar ruhige Minuten gut.', exercises: mobExercises(['mob-hip-flexor-standing', 'mob-hamstring-towel', 'mob-calf-wall', 'mob-chest-doorway']) };
const STRENGTH_MOBILITY = { id: 'mobility-strength-1793000000000', forSession: 'strength' as const, minutes: 6, reason: 'Nach dem Beintraining darfst du Gesäß und Oberschenkel noch kurz lockern.', exercises: mobExercises(['mob-quad-standing', 'mob-glute-figure-four', 'mob-hamstring-seated']) };
const none = { session: null, askFeel: false };
const afterRide = [{ rideId: 'm1', startedAtMs: Date.now() - 1800000, durationS: 2400, sessionName: 'Lockere Grundlage', status: 'finished', avgHrBpm: 138, maxHrBpm: 152, bestMinutePowerW: 140 }];
const GYM = {
  state: { ...initialGymState('pa'), localStart: true, planned: true, next: { source: 'rules' as const, reason: 'Beine und Rumpf, ruhiger Aufbau nach der Woche mit viel Radfahren.', workout: { name: 'Beine A', exercises: [
    { templateId: 'squat', title: 'Kniebeuge', restS: 120, supersetId: null, notes: '', sets: [{ type: 'warmup' as const, weightKg: 20, reps: 10 }, { type: 'normal' as const, weightKg: 40, reps: 8 }, { type: 'normal' as const, weightKg: 40, reps: 8 }] },
    { templateId: 'rdl', title: 'Rumänisches Kreuzheben', restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: 50, reps: 10 }, { type: 'normal' as const, weightKg: 50, reps: 10 }] },
    { templateId: 'leg-press', title: 'Beinpresse', restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: null, reps: null, repRange: { start: 10, end: 12 } }, { type: 'normal' as const, weightKg: null, reps: null, repRange: { start: 10, end: 12 } }] },
  ] } } },
  thinking: false, ready: true, hevy: false, hasHistory: true, complaints: [],
};
// Meals: a real rule plan for Max and Lena, seen on Tuesday 10 November 2026, with a few ticks and Lena out on Thursday evening.
const MEALS = await (async () => {
  let now = new Date(2026, 10, 7, 6).getTime(); // planned on Saturday morning, seen on Tuesday
  const c = new MealCoach({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'shots-meals-')), nowMs: () => now, profiles: () => [{ id: 'pa', name: 'Max' }, { id: 'pb', name: 'Lena' }], noOpenRide: () => true, trainingDays: () => [0, 3] });
  c.setSettings('pa', { on: true });
  c.setSettings('pb', { on: true, dislikes: ['Koriander', 'rohe Zwiebeln'] });
  await c.tick();
  now = new Date(2026, 10, 10, 9).getTime();
  const v = JSON.parse(JSON.stringify(c.view('pa')));
  const w = v.weeks[0];
  w.notice = null;
  w.state = withItem(withItem(withEater(w.state, '3-abend', 'pb', false, now), itemKey('Haferflocken', 'g'), 'da', now), itemKey('Skyr', 'g'), 'gekauft', now);
  return v;
})();
// The same week after a short chat with the coach: Lena's lunch on Wednesday changed at her wish, one message still waiting.
const MEALS_CHAT = (() => {
  const v = JSON.parse(JSON.stringify(MEALS));
  const now = new Date(2026, 10, 10, 9).getTime();
  const w = v.weeks[0];
  const m = w.plan.meals.find((x: { day: number; slot: string }) => x.day === 4 && x.slot === 'abend');
  // A whole dish of its own (title, ingredients and steps together), as the chat would put it there.
  const { recipeId: _r, ...other } = w.plan.meals.find((x: { day: number; slot: string }) => x.day === 0 && x.slot === 'mittag').dish;
  m.dish = { ...other, source: 'coach' };
  m.askedBy = 'pa';
  v.chat = [
    { id: 'chat-a1', week: w.plan.week, text: 'Danke, sieht gut aus', atMs: now - 2 * 86_400_000, reply: 'Gern, guten Appetit diese Woche.', answeredMs: now - 2 * 86_400_000, changed: [] },
    { id: 'chat-a2', week: w.plan.week, text: 'Das Rezept am Freitag ist zu aufwendig', atMs: now - 3_600_000, reply: 'Am Freitagabend gibt es jetzt Ofengemüse mit Halloumi, das ist schnell vorbereitet.', answeredMs: now - 3_500_000, changed: ['4-abend'] },
    { id: 'chat-a3', week: w.plan.week, text: 'Sonntag lieber was mit Nudeln', atMs: now - 60_000, reply: null, answeredMs: null, changed: [] },
  ];
  return v;
})();

const shots: { name: string; ride: object; coach?: object | null; steps?: (win: Page) => Promise<void>; crop?: string; pick?: boolean; offer?: object; width?: number; height?: number; hash?: string; click?: string; click2?: RegExp; wait?: number; fill?: boolean }[] = [
  { name: 'profile', ride: idle() },
  { name: 'profile-empty', ride: idle({ profiles: [] }) },
  { name: 'profile-estimate', ride: idle({ profiles: [] }), fill: true },
  { name: 'coach', ride: idle(), coach: coach(), pick: true, height: 1780 },
  { name: 'coach-estimated', ride: idle(), coach: coach({ ftpW: 139, ftpHistory: [{ atMs: Date.now(), ftpW: 139, source: 'manual' }], changes: [], notes: [] }), pick: true },
  { name: 'coach-ramp', ride: idle(), coach: coach({ next: { session: rampTest(150), reason: 'Der Rampentest zeigt, wo du gerade stehst. Danach richtet sich alles nach deinen Werten.', source: 'rules' }, phase: { name: 'Einstieg', weeksLeft: 0, goal: 'Die eigene Leistung kennenlernen' }, ftpForecast: [], changes: [], notes: [], ftpHistory: [], ftpW: 150 }), pick: true },
  { name: 'coach-limit', ride: idle(), coach: coach({ lastError: 'limit', next: { ...coach().next, source: 'rules' } }), pick: true },
  { name: 'coach-offline', ride: idle(), coach: null, pick: true },
  { name: 'feedback', ride: idle(), coach: coach({ awaitingFeedback: 'r1', summaries: [{ rideId: 'r1', startedAtMs: Date.now(), status: 'finished', sessionId: 'test-10', sessionName: 'Testfahrt, 10 Minuten', ftpW: 150, durationS: 600, avgPowerW: 112, normalizedPowerW: 130, intensityFactor: 0.87, tss: 12, avgHrBpm: 119, maxHrBpm: 155, bestMinutePowerW: 211, completedFraction: 1 }], detail: { rideId: 'r1', points: Array.from({ length: 200 }, (_, i) => ({ t: (i + 1) * 3, powerW: i % 40 < 12 ? 195 + (i % 5) : 110 + (i % 7), hrBpm: 120 + Math.round(30 * Math.sin(i / 12) ** 2), cadenceRpm: 72 + (i % 9) })) } }), pick: true, height: 1100 },
  { name: 'ride', ride: ride() },
  { name: 'ride-warn', ride: ride({ engine: engine({ stepRemainingS: 9, secondsToNext: 9 }) }) },
  { name: 'coach-cards', ride: idle(), coach: coach({ rules: [{ atMs: 1, text: 'Morgens lieber kurze Einheiten' }], alternatives: [{ session: { id: 'coach-alt-0', name: 'Hügelrunde', steps: [{ kind: 'erg', durationS: 420, ftpFraction: 0.5, label: 'Warmup' }, { kind: 'grade', durationS: 480, gradePct: 3, scale: 1, label: 'Anrollen' }, { kind: 'grade', durationS: 240, gradePct: -2, scale: 1, label: 'Abfahrt' }, { kind: 'grade', durationS: 720, gradePct: 5, scale: 1, label: 'Hauptanstieg' }, { kind: 'grade', durationS: 300, gradePct: -3, scale: 1, label: 'Abfahrt' }] }, why: 'Abwechslung, wenn du Lust auf Berge hast.' }] }), pick: true, height: 1400 },
  { name: 'together-page', ride: idle(), coach: coach({ together: TOGETHER }), click: 'Gemeinsame Übersicht' },
  { name: 'coach-together', ride: idle(), coach: coach({ together: { recent: [], people: [{ profileId: 'pa', name: 'Max', ridesThisWeek: 2, minutesThisWeek: 75, streakWeeks: 3, wordsLearned: 14, weeks: [] }, { profileId: 'pb', name: 'Lena', ridesThisWeek: 3, minutesThisWeek: 90, streakWeeks: 4, wordsLearned: 21, weeks: [] }], metres: 2240, lastRideMetres: 400, line: 'Lena legt diese Woche vor. Max, das Rad wartet schon.', peak: { name: 'Mont Ventoux', done: 1140, total: 1600, next: 'Stilfser Joch' } } }), pick: true },
  { name: 'ride-word', ride: ride({ engine: engine({ targetW: 100, label: 'Locker', nextLabel: 'Hart' }) }), coach: coach() },
  { name: 'ride-word-reveal', ride: ride({ engine: engine({ targetW: 100, label: 'Locker', nextLabel: 'Hart' }) }), coach: coach(), wait: 6500 },
  { name: 'history-insights', ride: idle(), height: 2200, coach: coach({ feedback: { i3: 'right' }, detail: { rideId: 'i3', points: Array.from({ length: 200 }, (_, i) => ({ t: (i + 1) * 9, powerW: 130 + (i % 5), hrBpm: 132 + (i % 9), cadenceRpm: 86 + (i % 4) })) },
    summaries: [
      ...Array.from({ length: 22 }, (_, i) => ({ rideId: `f${i}`, startedAtMs: Date.now() - 86400000 * (70 - i * 3), status: 'finished', sessionId: 'x', sessionName: 'Grundlage', ftpW: 210, durationS: 2400, avgPowerW: 118 + i, normalizedPowerW: 150, intensityFactor: 0.7, tss: 35 + (i % 4) * 12, avgHrBpm: 148 - i, maxHrBpm: 165, bestMinutePowerW: 180 + i, completedFraction: 1, powerCurve: { 5: 320 + i, 60: 190 + i, 300: 160 + i, 1200: 145 + i } })),
      { rideId: 'i1', startedAtMs: Date.now() - 86400000 * 8, status: 'finished', sessionId: 'locker-30', sessionName: 'Locker, 30 Minuten', ftpW: 210, durationS: 1800, avgPowerW: 126, normalizedPowerW: 128, intensityFactor: 0.61, tss: 19, avgHrBpm: 138, maxHrBpm: 146, bestMinutePowerW: 130, completedFraction: 1, onTargetPct: 94, powerCurve: { 5: 140, 60: 130, 300: 128, 1200: 127 } },
      { rideId: 'i3', startedAtMs: Date.now() - 86400000, status: 'finished', sessionId: 'locker-30', sessionName: 'Locker, 30 Minuten', ftpW: 210, durationS: 1800, avgPowerW: 126, normalizedPowerW: 128, intensityFactor: 0.61, tss: 19, avgHrBpm: 134, maxHrBpm: 142, bestMinutePowerW: 130, completedFraction: 1, onTargetPct: 96, powerCurve: { 5: 140, 60: 130, 300: 128, 1200: 127 } },
    ] }), pick: true, click: 'Verlauf', click2: new RegExp(new Date(Date.now() - 86400000).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })) },
  { name: 'ride-hold', ride: ride({ session: STARTER_SESSIONS.find((x) => x.id === 'puls-40'), profiles: [{ ...profiles[0], hrMaxBpm: 190 }, profiles[1]], engine: engine({ label: 'Puls halten', nextLabel: 'Ausrollen', targetW: 121, rideElapsedS: 900 }), latest: { ...latest, powerW: 120, hrBpm: 124 } }) },
  { name: 'ride-pass', ride: ride({ latest: { ...latest, powerW: 200 } }), coach: coach({ pass: { selectedId: 'alpe-dhuez', distanceM: { 'alpe-dhuez': 6900 } } }), wait: 400 },
  { name: 'ride-pass-summit', ride: ride({ latest: { ...latest, powerW: 200 } }), coach: coach({ pass: { selectedId: 'brocken', distanceM: { brocken: 8319 } } }), wait: 2500 },
  { name: 'coach-pass', ride: idle(), coach: coach({ pass: { selectedId: 'mont-ventoux', distanceM: { 'mont-ventoux': 9000 }, summits: [{ passId: 'alpe-dhuez', atMs: 1 }] } }), pick: true, height: 1300 },
  { name: 'ride-countdown', ride: ride({ engine: engine({ stepRemainingS: 3, secondsToNext: 3 }) }) },
  { name: 'history', ride: idle(), coach: coach({ feedback: { h1: 'right', h2: 'hard' }, detail: { rideId: 'h1', points: Array.from({ length: 200 }, (_, i) => ({ t: (i + 1) * 12, powerW: i % 40 < 12 ? 195 + (i % 5) : 110 + (i % 7), hrBpm: 120 + Math.round(30 * Math.sin(i / 12) ** 2) })) },
    summaries: [{ rideId: 'h1', startedAtMs: Date.now() - 86400000, durationS: 2400, sessionName: 'Intervalle, 45 Minuten', status: 'finished', avgHrBpm: 140, maxHrBpm: 165, bestMinutePowerW: 201, intervalsPlanned: 4, intervalsDone: 3 }, { rideId: 'h2', startedAtMs: Date.now() - 86400000 * 9, durationS: 1800, sessionName: 'Locker, 30 Minuten', status: 'finished', avgHrBpm: 125, maxHrBpm: 140, bestMinutePowerW: 130 }, { rideId: 'h3', startedAtMs: Date.now() - 86400000 * 24, durationS: 3000, sessionName: 'Steigung, 40 Minuten', status: 'aborted', avgHrBpm: 132, maxHrBpm: 150, bestMinutePowerW: 180 }] }), pick: true, click: 'Verlauf', click2: /Intervalle/ },
  { name: 'ride-climb', ride: ride({ session: STARTER_SESSIONS[0], engine: engine({ stepIndex: 4, rideElapsedS: 430, targetW: 105, label: 'Steigung', gradePct: null, gear: null }) }) },
  { name: 'ride-end', ride: ride(), click: 'Beenden' },
  { name: 'coach-route', ride: idle(), coach: coach({ next: { ...coach().next, session: STARTER_SESSIONS[2], source: 'rules' } }), pick: true },
  { name: 'ride-grade', ride: ride({ session: STARTER_SESSIONS[2], engine: engine({ targetW: null, gradePct: 4.5, gear: 7, label: 'Erster Anstieg', nextLabel: 'Erholung' }) }) },
  { name: 'ride-pause', ride: ride({ engine: engine({ paused: true }), latest: { ...latest, powerW: 0, cadenceRpm: 0 } }) },
  { name: 'ride-lost', ride: ride({ devices: { trainer: 'searching', hr: 'searching', clicker: 'searching' }, latest: { powerW: null, hrBpm: null, cadenceRpm: null, speedKph: null } }) },
  { name: 'ride-reduced', ride: ride({ engine: engine({ autoReducedPct: 10, targetW: 180 }) }) },
  { name: 'recovery', ride: idle(), offer: { rideId: 'r', profileId: 'pa', sessionName: 'Intervalle, 45 Minuten', rideElapsedS: 1432 } },
  { name: 'film', ride: ride(), width: 340, height: 300, hash: '#film' },
  { name: 'coach-garmin', ride: idle(), coach: coach(GARMIN), pick: true },
  { name: 'coach-garmin-login', ride: idle(), coach: coach({ garminMsg: { garmin: { state: 'idle' } } }), pick: true },
  { name: 'garmin-review', ride: idle(), coach: coach(GARMIN), pick: true, click: 'Werte aus Garmin prüfen' },
  { name: 'profile-edit', ride: idle(), coach: coach(GARMIN), pick: true, click: 'Profil', height: 1500 },
  { name: 'profile-connections-idle', ride: idle(), coach: coach({ garminMsg: { garmin: { state: 'idle' } } }), pick: true, click: 'Profil', height: 1500 },
  { name: 'start-overview', ride: idle(), coach: coach({ gym: GYM }), pick: true },
  { name: 'health', ride: idle(), coach: coach(GARMIN), pick: true, click: 'Gesundheit', height: 1300 },
  { name: 'mobility-bike', ride: idle(), coach: coach({ summaries: afterRide, mobility: { session: BIKE_MOBILITY, askFeel: false } }), pick: true, height: 1500, crop: '.mobility' },
  { name: 'mobility-bike-done', ride: idle(), coach: coach({ summaries: afterRide, mobility: { session: BIKE_MOBILITY, askFeel: false }, mobilityAfter: none }), pick: true, height: 1500, click: 'Gemacht' },
  { name: 'mobility-bike-open', ride: idle(), coach: coach({ summaries: afterRide, mobility: { session: BIKE_MOBILITY, askFeel: false } }), pick: true, height: 1500, click: 'Ansehen', crop: '.mobility' },
  { name: 'mobility-bike-feel', ride: idle(), coach: coach({ summaries: afterRide, mobility: { session: null, askFeel: true } }), pick: true, height: 1100, crop: '.mobility-feel' },
  { name: 'mobility-bike-both', ride: idle(), coach: coach({ summaries: afterRide, mobility: { session: BIKE_MOBILITY, askFeel: true } }), pick: true, height: 1900 },
  { name: 'mobility-strength', ride: idle(), coach: coach({ gym: GYM, mobility: { session: STRENGTH_MOBILITY, askFeel: false } }), pick: true, click: 'Kraft', height: 1500, crop: '.mobility' },
  { name: 'mobility-strength-done', ride: idle(), coach: coach({ gym: GYM, mobility: { session: STRENGTH_MOBILITY, askFeel: false }, mobilityAfter: none }), pick: true, click: 'Kraft', click2: /^Gemacht$/, height: 1100 },
  { name: 'mobility-strength-feel', ride: idle(), coach: coach({ gym: GYM, mobility: { session: null, askFeel: true } }), pick: true, click: 'Kraft', height: 1100, crop: '.mobility-feel' },
  { name: 'tracking-workout', ride: idle(), coach: coach({ gym: GYM }), pick: true, click: 'Kraft', height: 1500, steps: async (win) => {
    // Last time's Kniebeuge, so the rows can show it as a hint.
    await win.evaluate((t) => { const w = window as unknown as { __db?: Map<string, unknown> }; w.__db = new Map([['workout:old', { kind: 'workout', id: 'old', updatedMs: t, deleted: false, body: { id: 'old', title: 'Beine A', startMs: t - 3600000, endMs: t, source: 'pandafit', exercises: [{ exerciseId: 'squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [{ type: 'warmup', weightKg: 20, reps: 10, durationS: null, doneMs: t }, { type: 'normal', weightKg: 37.5, reps: 8, durationS: null, doneMs: t }, { type: 'normal', weightKg: 37.5, reps: 7, durationS: null, doneMs: t }] }] } }]]); }, Date.now() - 86400000 * 4);
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.getByRole('button', { name: 'Beine A starten' }).click();
    await win.waitForTimeout(200);
    await win.getByRole('button', { name: 'Satz 1 erledigt' }).first().click();
    await win.getByRole('button', { name: 'Satz 2 erledigt' }).first().click();
    await win.waitForTimeout(300);
  } },
  { name: 'workout-plates', ride: idle(), coach: coach({ gym: GYM }), pick: true, click: 'Kraft', height: 1100, steps: async (win) => {
    // An open workout with a barbell squat (next open set: 62 kg, between two plate sums) and two older sessions in the same studio, so the step is learned. The tracking screen reads the records when it opens.
    const t = Date.now();
    const day = 86400000;
    const mk = (id: string, startMs: number, endMs: number | null, ws: number[], done: boolean[]) => ({ kind: 'workout', id, updatedMs: startMs, deleted: false, body: { id, title: 'Beine A', startMs, endMs, source: 'pandafit', studio: 'Studio Mitte', exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: ws.map((weightKg, i) => ({ type: 'normal', weightKg, reps: 8, durationS: null, doneMs: done[i] ? t : null })) }] } });
    const rows = [mk('h1', t - 9 * day, t - 9 * day + 3600000, [50, 55], [true, true]), mk('h2', t - 4 * day, t - 4 * day + 3600000, [57.5, 60], [true, true]), mk('open', t - 600000, null, [60, 62, 62], [true, false, false])];
    await win.evaluate((rs) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map(rs.map((r) => [`workout:${r.id}`, r])); }, rows);
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.waitForTimeout(200);
    await win.getByRole('button', { name: 'Training fortsetzen' }).click();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: 'Mehr zu Kniebeuge' }).click();
    await win.getByRole('button', { name: 'Ausführung Kniebeuge' }).click();
    await win.waitForTimeout(200);
  } },
  { name: 'workout-summary', ride: idle(), coach: coach({ gym: GYM }), pick: true, click: 'Kraft', height: 900, steps: async (win) => {
    // A just-finished workout with the coach's next steps for two of its exercises (invented data). The start screen shows the summary until "Fertig".
    const t = Date.now();
    const sets = (kg: number, n: number) => Array.from({ length: n }, () => ({ type: 'normal', weightKg: kg, reps: 8, durationS: null, doneMs: t - 1800000 }));
    const rows = [
      { kind: 'workout', id: 'fin', updatedMs: t, deleted: false, body: { id: 'fin', title: 'Beine A', startMs: t - 3000000, endMs: t - 60000, source: 'pandafit', exercises: [
        { exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: sets(80, 3) }, { exerciseId: 'pf-leg-press', title: 'Beinpresse', supersetId: null, notes: '', sets: sets(120, 3) }, { exerciseId: 'pf-calf-raise', title: 'Wadenheben', supersetId: null, notes: '', sets: sets(40, 2) }] } },
      { kind: 'stats', id: 'stats', updatedMs: t, deleted: false, body: { type: 'stats', atMs: t, goal: null, days: [], muscles: {}, next: [
        { exerciseId: 'pf-squat', title: 'Kniebeuge', weightKg: 82.5, reps: 8, why: 'progress', reason: 'weil du alle Wiederholungen geschafft hast', forWorkoutId: 'fin', atMs: t - 3000000 },
        { exerciseId: 'pf-leg-press', title: 'Beinpresse', weightKg: 120, reps: 10, why: 'keep', reason: 'weil die Last gerade passt', forWorkoutId: 'fin', atMs: t - 3000000 }] } },
    ];
    await win.evaluate(([rs, id]) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map((rs as { kind: string; id: string }[]).map((r) => [`${r.kind}:${r.id}`, r])); localStorage.setItem('pandafit-summary-pending', id as string); }, [rows, 'fin']);
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.waitForTimeout(400);
  } },
  { name: 'workout-warmup', ride: idle(), coach: coach({ gym: GYM }), pick: true, click: 'Kraft', height: 1100, steps: async (win) => {
    // An open workout whose first exercise (barbell squat, 100 kg planned, 2.5 kg steps learned) has not started: the card offers the warm-up ramp.
    const t = Date.now();
    const day = 86400000;
    const ex = (kgs: number[]) => [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: kgs.map((weightKg) => ({ type: 'normal', weightKg, reps: 5, durationS: null, doneMs: null })) }];
    const mk = (id: string, startMs: number, endMs: number | null, kgs: number[], done: boolean) => ({ kind: 'workout', id, updatedMs: startMs, deleted: false, body: { id, title: 'Beine A', startMs, endMs, source: 'pandafit', studio: 'Studio Mitte', exercises: ex(kgs).map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, doneMs: done ? startMs + 600000 : null })) })) } });
    const rows = [mk('h1', t - 9 * day, t - 9 * day + 3600000, [92.5, 95], true), mk('h2', t - 4 * day, t - 4 * day + 3600000, [97.5, 100], true), mk('open', t - 600000, null, [100, 100, 100], false)];
    await win.evaluate((rs) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map(rs.map((r) => [`workout:${r.id}`, r])); }, rows);
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.waitForTimeout(200);
    await win.getByRole('button', { name: 'Training fortsetzen' }).click();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: 'Aufwärmen hinzufügen Kniebeuge' }).click();
    await win.waitForTimeout(300);
  } },
  { name: 'tracking-proposals', ride: idle(), coach: coach({ gym: GYM }), pick: true, click: 'Kraft', height: 1100, steps: async (win) => {
    // One proposal to confirm, one to change into a new exercise, and one recent link to change or take back.
    await win.evaluate((t) => {
      const w = window as unknown as { __db?: Map<string, unknown> };
      const rows: [string, object][] = [
        ['prop-aaaa0001', { proposal: { forTitle: 'Cable Row Custom', kind: 'same', targetId: 'pf-squat', reason: 'Gleiche Übung.', atMs: t } }],
        ['prop-aaaa0002', { title: 'Zorbo-Zug', type: 'weight_reps', primaryMuscle: 'lats', equipment: 'machine', source: 'ai', proposal: { forTitle: 'Zorbo Pull', kind: 'new', reason: 'Neu.', atMs: t } }],
        ['link-aaaa0003', { kind: 'link', title: 'Zorbo Curl', targetId: 'pf-front-squat', by: 'auto', atMs: t }],
      ];
      w.__db = new Map(rows.map((r) => [`exercise:${r[0]}`, { kind: 'exercise', id: r[0], updatedMs: t, deleted: false, body: { id: r[0], ...r[1] } }]));
    }, Date.now() - 3600000);
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.getByRole('button', { name: 'Zurück zu Kraft' }).click(); // the screen reads the records again when it is opened anew
    await win.getByRole('button', { name: 'Training starten' }).click();
    await win.waitForTimeout(300);
  } },
  { name: 'stats-muscles', ride: idle(), coach: coach({ gym: GYM }), pick: true, height: 1500, steps: async (win) => {
    // Bench press and lateral raises this week, a squat last week. The app reads the records once at start, so seed them and reload.
    await win.addInitScript((t) => {
      const rows: [string, number, string, string, number][] = [['s1', 0.2, 'pf-bench-press', 'Bankdrücken', 4], ['s2', 0.2, 'pf-lateral-raise', 'Seitheben', 3], ['s3', 6, 'pf-squat', 'Kniebeuge', 4]];
      const db = new Map<string, unknown>();
      for (const [id, ago, exerciseId, title, n] of rows) {
        const startMs = t - ago * 86400000;
        const sets = [];
        for (let i = 0; i < n; i++) sets.push({ type: 'normal', weightKg: 40, reps: 8, durationS: null, doneMs: startMs });
        db.set(`workout:${id}`, { kind: 'workout', id, updatedMs: startMs, deleted: false, body: { id, title: 'Training', startMs, endMs: startMs + 3600000, source: 'pandafit', exercises: [{ exerciseId, title, supersetId: null, notes: '', sets }] } });
      }
      (window as unknown as { __db: Map<string, unknown> }).__db = db;
    }, Date.now());
    await win.reload();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: /Max/ }).first().click();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: 'Statistik', exact: true }).first().click();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: /Schulter seitlich/ }).first().click();
    await win.waitForTimeout(150);
  } },
  { name: 'today-advice', ride: idle(), coach: coach({ gym: GYM }), pick: true, height: 1100, steps: async (win) => {
    // Invented data: a plan with strength today, a leg workout yesterday, so the hard day turns lighter. The advice differs from the plan and says why.
    const t = Date.now();
    const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const monday = new Date(t - ((new Date(t).getDay() + 6) % 7) * 86400000);
    const days = Array.from({ length: 7 }, (_, i) => ({ date: key(new Date(monday.getTime() + i * 86400000)), sport: (new Date(t).getDay() + 6) % 7 === i ? 'gym' : 'rest', hardness: 'hard', fixed: false }));
    const startMs = t - 86400000;
    const rows = [
      { kind: 'weekplan', id: key(monday), updatedMs: 1, deleted: false, body: { weekStart: key(monday), fromMessage: 'm', acceptedMs: 1, days } },
      { kind: 'workout', id: 'w1', updatedMs: startMs, deleted: false, body: { id: 'w1', title: 'Beine A', startMs, endMs: startMs + 3600000, source: 'pandafit', exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [] }] } },
      { kind: 'frame', id: 'frame', updatedMs: 1, deleted: false, body: { mode: 'week', minutes: 45, atMs: 1 } },
    ];
    await win.addInitScript((rs) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map(rs.map((r) => [`${r.kind}:${r.id}`, r])); }, rows);
    await win.reload();
    await win.waitForTimeout(300);
    await win.getByRole('button', { name: /Max/ }).first().click();
    await win.waitForTimeout(400);
  } },
  { name: 'week-rules', ride: idle(), coach: coach({ gym: GYM }), pick: true, height: 1100, steps: async (win) => {
    // Invented rules and a goal; the week screen reads the records when it opens.
    const t = Date.now() - 3600000;
    const R = (id: string, kind: string, text: string, sport: string, state: string, extra: object = {}) => ({ kind: 'rule', id, updatedMs: t, deleted: false, body: { kind, text, sport, state, source: 'person', atMs: t, ...extra } });
    const rows = [
      { kind: 'goal', id: 'goal', updatedMs: t, deleted: false, body: { strength: 'muscle', focus: ['chest', 'side_delts'], sports: { gym: 'focus', bike: 'equal', run: 'keep' }, atMs: t } },
      R('rule-s1', 'exclude', 'Ohne Beinpresse', 'gym', 'active', { exerciseIds: ['pf-leg-press'] }),
      R('rule-s2', 'wish', 'Lieber kurze Pausen zwischen den Sätzen', 'gym', 'active'),
      R('rule-s3', 'wish', 'Sonntags nur locker', 'all', 'paused'),
    ];
    await win.evaluate((rs) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map(rs.map((r) => [`${r.kind}:${r.id}`, r])); }, rows);
    await win.getByRole('button', { name: 'Woche', exact: true }).first().click();
    await win.waitForTimeout(300);
  }, crop: '.tk-rules' },
  { name: 'week-chat', ride: idle(), coach: coach({ gym: GYM }), pick: true, height: 1500, steps: async (win) => {
    // Invented chat over three days and two forwarded requests; the week screen reads the records when it opens.
    const t = Date.now();
    const at = (daysAgo: number, h: number, m: number) => { const d = new Date(t); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.getTime(); };
    const M = (id: string, role: string, text: string, atMs: number) => ({ kind: 'chat', id, updatedMs: atMs, deleted: false, body: { role, text, atMs } });
    const T = (id: string, from: string, to: string, text: string, lasting: boolean, atMs: number) => ({ kind: 'task', id, updatedMs: atMs, deleted: false, body: { from, to, text, lasting, atMs } });
    const rows = [
      M('c1', 'rider', 'Diese Woche passt Donnerstag nicht.', at(3, 18, 20)),
      M('c2', 'coach', 'Verstanden, ich lege Donnerstag frei.', at(3, 18, 21)),
      M('c3', 'rider', 'Heute nur eine Trizepsübung, die Schulter zwickt.', at(1, 7, 55)),
      M('c4', 'coach', 'Gebe ich an den Kraft-Coach weiter.', at(1, 7, 56)),
      M('c5', 'rider', 'Wie sieht morgen aus?', at(0, 8, 40)),
      M('c6', 'coach', 'Morgen ein lockerer Lauf, danach frei.', at(0, 8, 41)),
      T('task-s1', 'chat', 'gym', 'Nur eine Trizepsübung, Schulter schonen', false, at(1, 7, 56)),
      T('task-s2', 'bike', 'run', 'Beine nach der langen Fahrt locker halten', true, at(2, 19, 0)),
    ];
    await win.evaluate((rs) => { (window as unknown as { __db: Map<string, unknown> }).__db = new Map(rs.map((r) => [`${r.kind}:${r.id}`, r])); }, rows);
    await win.getByRole('button', { name: 'Woche', exact: true }).first().click();
    await win.waitForTimeout(300);
  } },
  { name: 'meals-week', ride: idle(), coach: coach({ meals: MEALS }), pick: true, click: 'Essen', height: 860, width: 1280 },
  { name: 'meals-chat', ride: idle(), coach: coach({ meals: MEALS_CHAT }), pick: true, click: 'Essen', height: 980, width: 1280 },
  { name: 'meals-chat-history', ride: idle(), coach: coach({ meals: MEALS_CHAT }), pick: true, click: 'Essen', height: 980, width: 1280, steps: async (win) => { await win.getByText(/Bisheriges Gespräch/).click(); await win.waitForTimeout(150); } },
  { name: 'meals-chat-recipe', ride: idle(), coach: coach({ meals: MEALS_CHAT }), pick: true, click: 'Essen', height: 980, width: 1280, click2: /Freitag, Abendessen/ },
  { name: 'meals-recipe', ride: idle(), coach: coach({ meals: MEALS }), pick: true, click: 'Essen', height: 860, width: 1280, click2: /Mittwoch, Mittagessen/ },
  { name: 'meals-shopping', ride: idle(), coach: coach({ meals: MEALS }), pick: true, click: 'Essen', height: 1000, width: 1280, click2: /^Einkaufsliste$/ },
  { name: 'meals-settings', ride: idle(), coach: coach({ meals: MEALS }), pick: true, click: 'Profil', height: 1700 },
  { name: 'status-off', ride: idle({ devices: { trainer: 'connected', hr: 'searching', clicker: 'off' }, deviceNames: { trainer: 'Zwift Hub' }, latest: {} }) },
];

const stub = () => {
  const w = window as unknown as { __ride: unknown; __coach: unknown; __offer: unknown; WebSocket: unknown };
  w.WebSocket = class {
    static OPEN = 1; readyState = 1; onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void;
    private coach: boolean;
    constructor(url: string) {
      this.coach = url.endsWith('7411');
      setTimeout(() => {
        if (this.coach && !w.__coach) { this.readyState = 3; this.onclose?.(); return; }
        this.onopen?.();
        if (this.coach) this.onmessage?.({ data: this.stateMsg(w.__coach as { mobility?: unknown }) });
        else {
          this.onmessage?.({ data: JSON.stringify(w.__ride) });
          if (w.__offer) this.onmessage?.({ data: JSON.stringify({ type: 'recovery-offer', ...(w.__offer as object) }) });
        }
      }, 0);
    }
    stateMsg(c: { mobility?: unknown }) { const x = c as { together?: unknown; garminMsg?: object; gym?: unknown }; return JSON.stringify({ type: 'coach-state', state: c, thinking: false, together: x.together, gym: x.gym, mobility: c.mobility, meals: (c as { meals?: unknown }).meals, ...x.garminMsg }); }
    send(raw: string) { if (this.coach && raw.includes('records-')) { const m = JSON.parse(raw) as { type: string; requestId: string; kind?: string; record?: { kind: string; id: string; updatedMs: number } }; const db = ((w as unknown as { __db?: Map<string, { kind: string }> }).__db ??= new Map()); if (m.record) db.set(`${m.record.kind}:${m.record.id}`, m.record); setTimeout(() => this.onmessage?.({ data: JSON.stringify(m.type === 'records-list' ? { type: 'records', requestId: m.requestId, kind: m.kind, records: [...db.values()].filter((r) => r.kind === m.kind) } : { type: 'records-put-result', requestId: m.requestId, ok: true, kept: true, updatedMs: m.record?.updatedMs }) }), 0); return; }
      if (this.coach && raw.includes('mobility-done')) { const c = w.__coach as { mobility?: unknown; mobilityAfter?: unknown }; c.mobility = c.mobilityAfter; setTimeout(() => this.onmessage?.({ data: this.stateMsg(c) }), 0); } const h = (w.__coach as { health?: unknown } | null)?.health; if (this.coach && h && raw.includes('garmin-health')) setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'garmin-health', data: h }) }), 0); const d = (w.__coach as { detail?: unknown } | null)?.detail; if (this.coach && d && raw.includes('ride-detail')) setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'ride-detail', detail: d }) }), 0); } close() {} addEventListener() {}
  };
};

const app = await electron.launch({ args: [process.env.UI_SHOTS_MAIN ?? path.join(import.meta.dirname, 'main.cjs')] });
const win = await app.firstWindow();
await app.context().addInitScript(stub);
const only = process.argv.slice(3);
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [s.width ?? 1200, s.height ?? 800]);
  await win.addInitScript(([r, c, o]) => { Object.assign(window, { __ride: r, __coach: c, __offer: o }); }, [s.ride, s.coach ?? null, s.offer ?? null] as const);
  await win.evaluate(([r, c, o, h]) => { Object.assign(window, { __ride: r, __coach: c, __offer: o }); sessionStorage.setItem('s', '1'); location.hash = h as string; }, [s.ride, s.coach ?? null, s.offer ?? null, s.hash ?? ''] as const);
  await win.reload();
  await win.waitForTimeout(150);
  if (s.pick) { await win.getByRole('button', { name: /Max/ }).first().click(); await win.waitForTimeout(150); }
  if (s.wait) await win.waitForTimeout(s.wait);
  if (s.click) { await win.getByRole('button', { name: s.click, exact: true }).first().click(); await win.waitForTimeout(100); }
  if (s.click2) { await win.getByRole('button', { name: s.click2 }).click(); await win.waitForTimeout(150); }
  if (s.steps) await s.steps(win);
  if (s.fill) {
    await win.getByLabel('Name').fill('Lena');
    await win.getByLabel('Alter').fill('35');
    await win.getByLabel('Größe (cm)').fill('180');
    await win.getByLabel('Gewicht (kg)').fill('80');
    await win.getByLabel('Geschlecht').selectOption('male');
    await win.getByLabel('Wie aktiv').selectOption('3');
    await win.waitForTimeout(100);
  }
  await win.screenshot({ path: path.join(out, `${s.name}.png`) });
  if (s.crop) await win.locator(s.crop).first().screenshot({ path: path.join(out, `${s.name}-card.png`) });
  console.log(s.name);
}
await app.close();
