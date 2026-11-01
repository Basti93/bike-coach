import type { Session } from './session';

const min = (n: number) => n * 60;
export const STARTER_SESSIONS: Session[] = [
  { id: 'test-10', name: 'Testfahrt, 10 Minuten', description: 'Kurz und moderat: prüft Wattvorgabe, Puls, Vokabeln und den sanften Einstieg in eine Steigung.', steps: [
    { kind: 'erg', durationS: min(2), ftpFraction: 0.5, label: 'Warmup' },
    { kind: 'erg', durationS: min(2), ftpFraction: 0.7, label: 'Gleichmäßig' },
    { kind: 'erg', durationS: 90, ftpFraction: 0.85, label: 'Kräftiger' },
    { kind: 'erg', durationS: min(1), ftpFraction: 0.5, label: 'Erholung' },
    { kind: 'grade', durationS: min(2), gradePct: 3, scale: 1, label: 'Steigung' },
    { kind: 'erg', durationS: 90, ftpFraction: 0.45, label: 'Ausrollen' },
  ] },
  { id: 'locker-30', name: 'Locker, 30 Minuten', description: 'Gleichmäßig und ruhig, du kannst dich dabei gut unterhalten.', steps: [
    { kind: 'erg', durationS: min(5), ftpFraction: 0.45, label: 'Warmup' },
    { kind: 'erg', durationS: min(22), ftpFraction: 0.6, label: 'Locker' },
    { kind: 'erg', durationS: min(3), ftpFraction: 0.45, label: 'Ausrollen' },
  ] },
  { id: 'intervalle-45', name: 'Intervalle, 45 Minuten', description: 'Vier harte Blöcke von je 4 Minuten mit Erholung dazwischen.', steps: [
    { kind: 'erg', durationS: min(10), ftpFraction: 0.5, label: 'Warmup' },
    ...Array.from({ length: 4 }, () => [
      { kind: 'erg' as const, durationS: min(4), ftpFraction: 0.95, label: 'Hart' },
      { kind: 'erg' as const, durationS: min(3), ftpFraction: 0.5, label: 'Erholung' },
    ]).flat(),
    { kind: 'erg', durationS: min(7), ftpFraction: 0.45, label: 'Ausrollen' },
  ] },
  { id: 'steigung-40', name: 'Steigung, 40 Minuten', description: 'Zwei Anstiege mit kurzer Abfahrt, die App gibt die Watt vor.', steps: [
    { kind: 'erg', durationS: min(8), ftpFraction: 0.5, label: 'Warmup' },
    { kind: 'grade', durationS: min(10), gradePct: 4, scale: 1, label: 'Erster Anstieg' },
    { kind: 'grade', durationS: min(4), gradePct: -1, scale: 1, label: 'Abfahrt' },
    { kind: 'grade', durationS: min(10), gradePct: 6, scale: 1, label: 'Zweiter Anstieg' },
    { kind: 'erg', durationS: min(8), ftpFraction: 0.45, label: 'Ausrollen' },
  ] },
];
