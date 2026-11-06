import { EXERCISES, exerciseTitles, linkHevyTemplates } from '../../src/shared/exercises';
import { exerciseDescription } from '../../src/shared/exercise-descriptions';
import { muscleGroupOf } from '../../src/shared/muscle-targets';

const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

it('no title, Hevy title or alias belongs to two exercises', () => {
  const seen = new Map<string, string>();
  for (const e of EXERCISES) for (const t of new Set(exerciseTitles(e))) {
    expect(`${t} → ${seen.get(t) ?? e.id}`).toBe(`${t} → ${e.id}`);
    seen.set(t, e.id);
  }
});

it('the machine reverse fly is its own exercise with a machine text and counts for the rear shoulder', () => {
  const e = byId('pf-rear-delt-fly-machine');
  expect(e.equipment).toBe('machine');
  expect(exerciseDescription(e.id)?.text).toMatch(/Maschine|Griff|Polster/);
  expect(exerciseDescription(e.id)?.text).not.toMatch(/Kurzhantel/);
  expect(muscleGroupOf(e)).toBe('side_rear_delts');
});

it('the cable bent-over lateral raise counts for the rear shoulder', () => {
  expect(muscleGroupOf(byId('pf-bent-over-lateral-raise-cable'))).toBe('side_rear_delts');
});

it('the behind-the-back curl has an own description', () => {
  expect(exerciseDescription('pf-behind-back-curl-cable')?.source).toEqual({ kind: 'own' });
});

it('every new row variant counts for the back', () => {
  for (const id of ['pf-seated-row-machine', 'pf-seated-row-cable-v', 'pf-seated-row-cable-close']) expect(muscleGroupOf(byId(id))).toBe('back');
});

it('links Hevy templates by alias as well', () => {
  expect(linkHevyTemplates([{ id: 'h1', title: 'Cable Curl' }, { id: 'h2', title: 'Rear Delt Reverse Fly (Machine)' }]))
    .toEqual(new Map([['h1', 'pf-cable-curl'], ['h2', 'pf-rear-delt-fly-machine']]));
});

it('lists aliases among the titles of an exercise', () => {
  expect(exerciseTitles(byId('pf-cable-curl'))).toContain('Cable Curl');
});
