import { RUN_REGION, runComplaintMode } from '../../../src/coach/run/complaints';
import { complaintFromNote, type Complaint } from '../../../src/coach/motivation';

const DAY = 86_400_000;
const NOW = new Date(2027, 5, 16, 12).getTime();
const c = (text: string, status: Complaint['status'], updatedMs = NOW): Complaint => ({ id: text, text, status, startedMs: NOW - 20 * DAY, updatedMs });

test('region words in German and English match', () => {
  for (const w of ['Knie', 'Fuß', 'Sprunggelenk', 'Knöchel', 'Schienbein', 'Achillessehne', 'Wade', 'Hüfte', 'unterer Rücken', 'knee', 'foot', 'ankle', 'shin', 'Achilles', 'calf', 'hip', 'lower back']) {
    expect(RUN_REGION.test(w), w).toBe(true);
  }
});

test('Schulter and Nacken do not touch running', () => {
  expect(RUN_REGION.test('Schulter')).toBe(false);
  expect(RUN_REGION.test('Nacken')).toBe(false);
  expect(RUN_REGION.test('Fußball')).toBe(false);
});

test('complaintFromNote takes "shin hurts" and "Schienbein zieht" as active complaints', () => {
  expect(complaintFromNote('shin hurts')).toBe('active');
  expect(complaintFromNote('Schienbein zieht')).toBe('active');
  expect(complaintFromNote('shin is fine, wieder gut')).toBeNull();
});

test('an active knee complaint pauses, a healing one halves, one closed 3 days ago restarts, one closed 8 days ago is null', () => {
  expect(runComplaintMode([c('Knie', 'active')], NOW)).toBe('pause');
  expect(runComplaintMode([c('Knie', 'healing')], NOW)).toBe('half');
  expect(runComplaintMode([c('Knie', 'over', NOW - 3 * DAY)], NOW)).toBe('restart');
  expect(runComplaintMode([c('Knie', 'over', NOW - 8 * DAY)], NOW)).toBeNull();
});

test('other regions and no complaints give null', () => {
  expect(runComplaintMode([c('Schulter', 'active')], NOW)).toBeNull();
  expect(runComplaintMode([], NOW)).toBeNull();
});

test('active beats healing beats restart', () => {
  const all = [c('Knie', 'over', NOW - DAY), c('Wade', 'healing'), c('Achilles', 'active')];
  expect(runComplaintMode(all, NOW)).toBe('pause');
  expect(runComplaintMode(all.slice(0, 2), NOW)).toBe('half');
});
