import { estimateFtp, vo2maxFromProfile, vo2maxFromRun } from '../../src/shared/ftp-estimate';

const man = { age: 35, sex: 'male' as const, weightKg: 80, heightCm: 180, activity: 3 };
test('worked example matches the checked calculation', () => {
  expect(vo2maxFromProfile(man)).toBeCloseTo(41.16, 1);
  expect(vo2maxFromRun(28)).toBeCloseTo(33.48, 1);
  expect(estimateFtp({ ...man, run5kMin: 28 })).toMatchObject({ startW: 101, likelyW: 129 });
  expect(estimateFtp(man)).toMatchObject({ startW: 139, likelyW: 167 });
});
test('never above the cap, never below the floor', () => {
  expect(estimateFtp({ age: 18, sex: 'male', weightKg: 70, heightCm: 195, activity: 7 }).startW).toBeLessThanOrEqual(195);
  expect(estimateFtp({ age: 90, sex: 'female', weightKg: 130, heightCm: 150, activity: 0 }).startW).toBe(50);
});
