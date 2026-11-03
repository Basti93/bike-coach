import { complaintFromNote, motivationOverview, nextQuestion, QUESTIONS, ruleEncouragement } from '../../src/coach/motivation';
import type { RideSummary } from '../../src/coach/metrics';

const DAY = 86_400_000;
const NOW = 1000 * DAY;
const ride = (daysAgo: number, minutes = 30): RideSummary => ({ rideId: `r${daysAgo}`, startedAtMs: NOW - daysAgo * DAY, status: 'finished', sessionId: 's', ftpW: 150, durationS: minutes * 60, avgPowerW: 100, normalizedPowerW: 100, intensityFactor: 0.6, tss: 20, avgHrBpm: 120, maxHrBpm: 140, bestMinutePowerW: 130, completedFraction: 1 });

describe('complaints from a note', () => {
  test('recognises a current complaint', () => {
    expect(complaintFromNote('Knie zwickt')).toBe('active');
    expect(complaintFromNote('Rücken tut heute weh')).toBe('active');
  });
  test('recognises one that is healing but still uncertain', () => {
    expect(complaintFromNote('Knie verletzt und verheilt, aber noch unsicher')).toBe('healing');
  });
  test('recognises a broken bone and an operation', () => {
    expect(complaintFromNote('Ich habe mir den Sitzbeinhöcker gebrochen, nach 4 Monaten sollte er verheilt sein. Langsam einsteigen.')).toBe('healing');
    expect(complaintFromNote('Bruch am Handgelenk')).toBe('active');
    expect(complaintFromNote('Nach der Operation am Fuß noch vorsichtig')).toBe('active');
    expect(complaintFromNote('Bandscheibe meldet sich')).toBe('active');
  });
  test('the foot alone carries a complaint, with ß or ss, but Fußball does not', () => {
    expect(complaintFromNote('Mein Fuß schmerzt')).toBe('active');
    expect(complaintFromNote('Mein Fuß ist geschwollen')).toBe('active');
    expect(complaintFromNote('Nach dem Eingriff am Fuß noch vorsichtig')).toBe('active');
    expect(complaintFromNote('mein Fuss')).toBe('active');
    expect(complaintFromNote('Fußball am Samstag')).toBeNull();
  });
  test('a word that only contains a body word is not a complaint', () => {
    expect(complaintFromNote('Abbruch wegen Regen')).toBeNull();
    expect(complaintFromNote('Hand aufs Herz, das war schön')).toBeNull();
  });
  test('ignores notes that are not about the body or say it is fine', () => {
    expect(complaintFromNote('Morgens lieber kurze Einheiten')).toBeNull();
    expect(complaintFromNote('Knie ist wieder gut')).toBeNull();
    expect(complaintFromNote('Keine Schmerzen mehr')).toBeNull();
  });
});

describe('questions about what drives you', () => {
  test('the first question comes right away, as an open question', () => {
    const q = nextQuestion([], undefined, NOW);
    expect(q?.id).toBe(QUESTIONS[0].id);
    expect(QUESTIONS.every((x) => x.text.endsWith('?'))).toBe(true);
  });
  test('at most one question every few days, even after skipping', () => {
    expect(nextQuestion([], NOW - DAY, NOW)).toBeNull();
    expect(nextQuestion([], NOW - 3 * DAY, NOW)).not.toBeNull();
  });
  test('moves on to a question not answered yet', () => {
    const answered = [{ atMs: NOW - 10 * DAY, questionId: QUESTIONS[0].id, text: 'Für meine Kinder' }];
    expect(nextQuestion(answered, NOW - 10 * DAY, NOW)?.id).toBe(QUESTIONS[1].id);
  });
  test('when everything is answered it stays quiet, and asks the oldest again after three months', () => {
    const all = QUESTIONS.map((q, i) => ({ atMs: NOW - (10 + i) * DAY, questionId: q.id, text: 'x' }));
    expect(nextQuestion(all, NOW - 10 * DAY, NOW)).toBeNull();
    const old = all.map((a, i) => (i === 2 ? { ...a, atMs: NOW - 100 * DAY } : a));
    expect(nextQuestion(old, NOW - 10 * DAY, NOW)?.id).toBe(QUESTIONS[2].id);
  });
});

describe('overview', () => {
  test('counts what you did, against yourself only', () => {
    const o = motivationOverview([ride(1, 30), ride(2, 20), ride(40, 60)], NOW);
    expect(o.rides).toBe(3);
    expect(o.minutes28).toBe(50);
    expect(o.totalHours).toBeCloseTo(1.8, 1);
  });
  test('names the longest ride when the latest one is it', () => {
    expect(motivationOverview([ride(5, 20), ride(1, 45)], NOW).highlight).toContain('längste');
  });
  test('names a growing month, and stays silent when nothing grew', () => {
    expect(motivationOverview([ride(1, 40), ride(9, 40), ride(35, 30)], NOW).highlight).toContain('mehr');
    expect(motivationOverview([ride(1, 10), ride(35, 90)], NOW).highlight).toBeNull();
  });
  test('an empty history has no reproach', () => {
    expect(motivationOverview([], NOW)).toMatchObject({ rides: 0, highlight: null });
  });
});

describe('words without the AI', () => {
  test('a long break is welcomed, never counted against you', () => {
    const text = ruleEncouragement([ride(60)], NOW);
    expect(text).not.toMatch(/\d+ Tage|verpasst|versäumt|Pause von|musst|solltest/i);
  });
  test('a complaint comes first', () => {
    expect(ruleEncouragement([ride(1)], NOW, true)).toMatch(/Körper|ruhig/);
  });
});
