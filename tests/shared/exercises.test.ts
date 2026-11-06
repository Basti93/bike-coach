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

it('knows the German Hevy title: own German title with the equipment in German', () => {
  expect(exerciseTitles(byId('pf-lateral-raise'))).toContain('Seitheben (Kurzhantel)');
  expect(exerciseTitles(byId('pf-bench-press'))).toContain('Bankdrücken (Langhantel)');
});
