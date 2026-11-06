import { EXERCISES, type Exercise } from '../../src/shared/exercises';
import { resolveExercise } from '../../src/tracking/exercise-identity';
import { describeExercise } from '../../src/tracking/similar';

const r = (exerciseId: string, title: string, ext?: Record<string, string>) => resolveExercise({ exerciseId, title }, EXERCISES, ext);

it('finds the own exercise by id, by German, English and German-equipment Hevy title, and by alias', () => {
  expect(r('pf-squat', 'egal').exercise?.id).toBe('pf-squat');
  expect(r('h', 'Kniebeuge').exercise?.id).toBe('pf-squat');
  expect(r('h', 'Lat Pulldown - Close Grip (Cable)').exercise?.id).toBe('pf-lat-pulldown-close');
  expect(r('h', 'Seitheben (Kurzhantel)').exercise?.id).toBe('pf-lateral-raise');
  expect(r('h', 'Cable Curl').exercise?.id).toBe('pf-cable-curl');
  expect(r('h', 'Cable Curl')).toMatchObject({ group: 'biceps', muscleSource: 'catalog' });
});

it('never takes a look-alike with other equipment as the same exercise', () => {
  expect(r('h', 'Squat (Smith Machine)')).toEqual({ exercise: null, group: null, muscleSource: 'unknown' });
  expect(describeExercise({ exerciseId: 'h', title: 'Squat (Smith Machine)' }, EXERCISES)).toBeNull();
});

it('gives the machine reverse fly its own machine text', () => {
  expect(describeExercise({ exerciseId: 'h', title: 'Rear Delt Reverse Fly (Machine)' }, EXERCISES)?.text).not.toMatch(/Kurzhantel/);
});

it('uses an external muscle for an unknown exercise and says where it came from', () => {
  expect(r('h9', 'Squat (Smith Machine)', { h9: 'quadriceps' })).toEqual({ exercise: null, group: 'quads', muscleSource: 'external' });
  expect(r('h9', 'X', { h9: 'back' }).group).toBe('back');
});

it('ignores inherited keys and empty values of the external map', () => {
  expect(r('__proto__', 'X', {}).muscleSource).toBe('unknown');
  expect(r('constructor', 'X', {}).muscleSource).toBe('unknown');
  expect(r('h', 'X', { h: '' }).muscleSource).toBe('unknown');
});

it('finds a user-created exercise in the catalog passed in', () => {
  const mine: Exercise = { id: 'my-own-uuid', title: 'Meine Übung', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'machine' };
  expect(resolveExercise({ exerciseId: 'my-own-uuid', title: 'Meine Übung' }, [...EXERCISES, mine])).toMatchObject({ group: 'chest', muscleSource: 'catalog' });
});
