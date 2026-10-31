// Macht Screenshots aller wichtigen Zustände mit nachgestellten Daten. Rührt echte Daten und Geräte nicht an.
// Aufruf: npm run build && npm run ui:shots -- <Zielordner>
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';
import { rampTest } from '../../src/coach/rules';
import { STARTER_SESSIONS } from '../../src/shared/starter-sessions';

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

const shots: { name: string; ride: object; coach?: object | null; pick?: boolean; offer?: object; width?: number; height?: number; hash?: string; click?: string; fill?: boolean }[] = [
  { name: 'profile', ride: idle() },
  { name: 'profile-empty', ride: idle({ profiles: [] }) },
  { name: 'profile-estimate', ride: idle({ profiles: [] }), fill: true },
  { name: 'coach', ride: idle(), coach: coach(), pick: true },
  { name: 'coach-estimated', ride: idle(), coach: coach({ ftpW: 139, ftpHistory: [{ atMs: Date.now(), ftpW: 139, source: 'manual' }], changes: [], notes: [] }), pick: true },
  { name: 'coach-ramp', ride: idle(), coach: coach({ next: { session: rampTest(150), reason: 'Der Rampentest zeigt, wo du gerade stehst. Danach richtet sich alles nach deinen Werten.', source: 'rules' }, phase: { name: 'Einstieg', weeksLeft: 0, goal: 'Die eigene Leistung kennenlernen' }, ftpForecast: [], changes: [], notes: [], ftpHistory: [], ftpW: 150 }), pick: true },
  { name: 'coach-limit', ride: idle(), coach: coach({ lastError: 'limit', next: { ...coach().next, source: 'rules' } }), pick: true },
  { name: 'coach-offline', ride: idle(), coach: null, pick: true },
  { name: 'feedback', ride: idle(), coach: coach({ awaitingFeedback: 'r1' }), pick: true },
  { name: 'ride', ride: ride() },
  { name: 'ride-warn', ride: ride({ engine: engine({ stepRemainingS: 9, secondsToNext: 9 }) }) },
  { name: 'coach-cards', ride: idle(), coach: coach({ alternatives: [{ session: { id: 'coach-alt-0', name: 'Hügelrunde', steps: [{ kind: 'erg', durationS: 420, ftpFraction: 0.5, label: 'Warmup' }, { kind: 'grade', durationS: 480, gradePct: 3, scale: 1, label: 'Anrollen' }, { kind: 'grade', durationS: 240, gradePct: -2, scale: 1, label: 'Abfahrt' }, { kind: 'grade', durationS: 720, gradePct: 5, scale: 1, label: 'Hauptanstieg' }, { kind: 'grade', durationS: 300, gradePct: -3, scale: 1, label: 'Abfahrt' }] }, why: 'Abwechslung, wenn du Lust auf Berge hast.' }] }), pick: true, height: 1400 },
  { name: 'ride-end', ride: ride(), click: 'Beenden' },
  { name: 'coach-route', ride: idle(), coach: coach({ next: { ...coach().next, session: STARTER_SESSIONS[2], source: 'rules' } }), pick: true },
  { name: 'ride-grade', ride: ride({ session: STARTER_SESSIONS[2], engine: engine({ targetW: null, gradePct: 4.5, gear: 7, label: 'Erster Anstieg', nextLabel: 'Erholung' }) }) },
  { name: 'ride-pause', ride: ride({ engine: engine({ paused: true }), latest: { ...latest, powerW: 0, cadenceRpm: 0 } }) },
  { name: 'ride-lost', ride: ride({ devices: { trainer: 'searching', hr: 'searching', clicker: 'searching' }, latest: { powerW: null, hrBpm: null, cadenceRpm: null, speedKph: null } }) },
  { name: 'ride-reduced', ride: ride({ engine: engine({ autoReducedPct: 10, targetW: 180 }) }) },
  { name: 'recovery', ride: idle(), offer: { rideId: 'r', profileId: 'pa', sessionName: 'Intervalle, 45 Minuten', rideElapsedS: 1432 } },
  { name: 'film', ride: ride(), width: 340, height: 300, hash: '#film' },
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
        if (this.coach) this.onmessage?.({ data: JSON.stringify({ type: 'coach-state', state: w.__coach, thinking: false }) });
        else {
          this.onmessage?.({ data: JSON.stringify(w.__ride) });
          if (w.__offer) this.onmessage?.({ data: JSON.stringify({ type: 'recovery-offer', ...(w.__offer as object) }) });
        }
      }, 0);
    }
    send() {} close() {} addEventListener() {}
  };
};

const app = await electron.launch({ args: [path.join(import.meta.dirname, 'main.cjs')] });
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
  if (s.click) { await win.getByRole('button', { name: s.click }).click(); await win.waitForTimeout(100); }
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
  console.log(s.name);
}
await app.close();
