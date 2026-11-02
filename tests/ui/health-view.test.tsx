// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HealthView } from '../../src/ui/views/HealthView';
import type { GarminHealth } from '../../src/shared/garmin';

afterEach(cleanup);
const point = (date: string, over = {}) => ({ date, restingHrBpm: 60, vo2max: 51, sleepS: null, hrvMs: null, stressAvg: 30, bodyBatteryMax: 90, load: 40, ...over });
const data: GarminHealth = {
  points: [point('2026-10-30'), point('2026-10-31', { restingHrBpm: 62 }), point('2026-11-01')],
  years: [{ jahr: '2026', sport: 'cycling', anzahl: 5, stunden: 6.5 }],
  progress: { activities: 293, activitiesComplete: true, daysDone: 50, daysTotal: 2758, filesDone: 0, filesTotal: 293 },
  pulseBeforeRides: null,
};
const view = (over: Partial<Parameters<typeof HealthView>[0]> = {}) => {
  const onRange = vi.fn(); const onBack = vi.fn();
  render(<HealthView data={data} range={28} onRange={onRange} readiness={null} sync={{ running: false, lastRunMs: Date.parse('2026-11-01T09:00:00'), complete: false, problem: null }} onBack={onBack} {...over} />);
  return { onRange, onBack };
};

test('shows a chart for each measure with data and hides the rest with a short hint', () => {
  view();
  expect(screen.getByRole('img', { name: /Ruhepuls/ })).toBeTruthy();
  expect(screen.getByRole('img', { name: /VO2max/ })).toBeTruthy();
  expect(screen.queryByRole('img', { name: /Schlaf/ })).toBeNull();
  expect(screen.queryByRole('img', { name: /HRV/ })).toBeNull();
  expect(document.body.textContent).toContain('Keine Daten von deiner Uhr: Schlaf, HRV');
});
test('sleep appears as soon as there is data', () => {
  view({ data: { ...data, points: [point('2026-11-01', { sleepS: 7 * 3600 })] } });
  expect(screen.getByRole('img', { name: /Schlaf/ })).toBeTruthy();
});
test('a chart names its latest value and hover shows another day', () => {
  view();
  const chart = screen.getByRole('img', { name: /Ruhepuls/ }).closest('figure')!;
  expect(chart.textContent).toContain('60');
  fireEvent.mouseMove(chart.querySelector('svg')!, { clientX: 0 });
  expect(chart.textContent).toMatch(/\d/);
});
test('the range can be chosen', () => {
  const { onRange } = view();
  fireEvent.click(screen.getByRole('button', { name: '1 Jahr' }));
  expect(onRange).toHaveBeenCalledWith(365);
  fireEvent.click(screen.getByRole('button', { name: 'Gesamt' }));
  expect(onRange).toHaveBeenCalledWith(null);
  expect(screen.getByRole('button', { name: '28 Tage' }).getAttribute('aria-pressed')).toBe('true');
});
test('the yearly table lists sports with count and hours', () => {
  view();
  const row = screen.getByRole('row', { name: /2026/ });
  expect(row.textContent).toContain('Radfahren');
  expect(row.textContent).toContain('6,5');
});
test('shows history progress, last update and that this is no medical analysis', () => {
  view();
  const text = document.body.textContent!;
  expect(text).toContain('50 von 2758 Tagen');
  expect(text).toContain('Zuletzt aktualisiert');
  expect(text).toContain('keine medizinische Auswertung');
});
test('an expired login is explained, and the empty state is friendly', () => {
  view({ sync: { running: false, lastRunMs: 1, complete: false, problem: 'reauth' }, data: { ...data, points: [], years: [] } });
  expect(screen.getByRole('alert').textContent).toContain('erneut anmelden');
  expect(document.body.textContent).toContain('Noch keine Daten');
});
test('without data yet it shows loading and offers the way back', () => {
  const { onBack } = view({ data: null });
  expect(document.body.textContent).toContain('lädt');
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  expect(onBack).toHaveBeenCalled();
});
test('the pulse comparison appears once there are enough rides', () => {
  view({ data: { ...data, pulseBeforeRides: { hard: 66, other: 60, rides: 12 } } });
  expect(document.body.textContent).toContain('66');
  expect(document.body.textContent).toContain('12 bewerteten Fahrten');
});

const strength = { recent: [{ id: 'w', title: 'Beine', startMs: Date.parse('2027-06-14T10:00:00'), minutes: 45, sets: 9, volumeKg: 4200 }], weeks: [{ weekStartMs: Date.parse('2027-06-14T00:00:00'), workouts: 1, volumeKg: 4200 }, { weekStartMs: Date.parse('2027-06-07T00:00:00'), workouts: 0, volumeKg: 0 }], sessions: [] };
test('Gesundheit shows Hevy workouts next to Garmin', () => {
  view({ strength });
  expect(screen.getByRole('heading', { name: 'Krafttraining' })).toBeTruthy();
  expect(document.body.textContent).toContain('Beine');
  expect(document.body.textContent).toContain('45 Min.');
  expect(document.body.textContent).toContain('4.200 kg');
  expect(screen.getByRole('img', { name: /Ruhepuls/ })).toBeTruthy();
});
test('Gesundheit with only Hevy shows no empty Garmin sections', () => {
  view({ strength, garmin: false, data: null, sync: null });
  expect(screen.getByRole('heading', { name: 'Krafttraining' })).toBeTruthy();
  expect(screen.queryByText(/Seite lädt/)).toBeNull();
  expect(screen.queryByText(/Keine Daten/)).toBeNull();
  expect(screen.queryByRole('button', { name: '28 Tage' })).toBeNull();
  expect(screen.queryByText(/Garmin|Uhr/)).toBeNull();
});
const monday = new Date(2027, 5, 14, 0).getTime();
const ride = (rideId: string, startedAtMs: number, minutes: number, sessionName?: string) => ({ rideId, startedAtMs, durationS: minutes * 60, sessionName }) as never;
const together = (over: Partial<Parameters<typeof HealthView>[0]> = {}) => view({
  rides: [ride('r1', monday + 36e5 * 10, 90, 'Grundlage')],
  strength: { ...strength, sessions: [{ id: 'w', title: 'Beine', startMs: monday + 36e5 * 30, durationS: 2700 }] },
  data: { ...data, activities: [{ id: 'g', startMs: monday + 36e5 * 50, durationS: 1800, sport: 'hiking', name: null, fromBikeCoach: false }] },
  ...over,
});
test('the combined week view shows every source split, with time and counts but no combined score', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2027, 5, 16, 12));
  together();
  vi.useRealTimers();
  const section = screen.getByRole('heading', { name: 'Training insgesamt' }).closest('section')!;
  const bars = screen.getByRole('list', { name: /Trainingszeit pro Woche/ });
  expect(bars.querySelectorAll('li')).toHaveLength(12);
  const last = bars.querySelectorAll('li')[11];
  expect(last.getAttribute('title')).toMatch(/Rad 1,5 Std. \(1\).*Kraft 45 Min. \(1\).*Andere 30 Min. \(1\)/);
  expect(last.querySelectorAll('.seg-rad, .seg-kraft, .seg-andere')).toHaveLength(3);
  expect(section.textContent).toContain('Grundlage');
  expect(section.textContent).toContain('Beine');
  expect(section.textContent).toContain('Wandern');
  expect(section.textContent).not.toMatch(/Punkte|Watt|kg|Score/);
  expect(section.compareDocumentPosition(screen.getByRole('img', { name: /Ruhepuls/})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
test('a missing source drops out, and with no sessions there is no combined section', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2027, 5, 16, 12));
  view({ rides: [ride('r1', monday + 36e5 * 10, 60)] });
  vi.useRealTimers();
  expect(screen.getByRole('heading', { name: 'Training insgesamt' })).toBeTruthy();
  expect(document.querySelector('.seg-kraft, .seg-andere')).toBeNull();
  expect(screen.queryByText(/Kraft/)).toBeNull();
  cleanup();
  view();
  expect(screen.queryByRole('heading', { name: 'Training insgesamt' })).toBeNull();
});
test('Hevy only: the combined view shows without Garmin sections', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2027, 5, 16, 12));
  view({ strength: { ...strength, sessions: [{ id: 'w', title: 'Beine', startMs: monday + 36e5 * 30, durationS: 2700 }] }, garmin: false, data: null, sync: null });
  vi.useRealTimers();
  expect(screen.getByRole('heading', { name: 'Training insgesamt' })).toBeTruthy();
  expect(screen.queryByText(/Garmin|Uhr/)).toBeNull();
});
test('Gesundheit with only Garmin looks as it does today', () => {
  view({ strength: null });
  expect(screen.queryByRole('heading', { name: 'Krafttraining' })).toBeNull();
  expect(screen.getByRole('button', { name: '28 Tage' })).toBeTruthy();
});
