import { descriptionCredit, EXERCISE_DESCRIPTIONS, exerciseDescription } from '../../src/shared/exercise-descriptions';
import { EXERCISES } from '../../src/shared/exercises';
import matches from '../../scripts/wger-matches.json';

const entries = Object.entries(EXERCISE_DESCRIPTIONS);
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);

test('every own exercise has a description, and no description is for an unknown exercise', () => {
  for (const e of EXERCISES) expect(EXERCISE_DESCRIPTIONS[e.id], e.id).toBeDefined();
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const [id] of entries) expect(ids.has(id), id).toBe(true);
});

test('every wger entry names its exercise id, author and licence, and matches the reviewed mapping', () => {
  const accepted = (matches as { accepted: Record<string, number> }).accepted;
  for (const [id, d] of entries) {
    if (d.source.kind !== 'wger') { expect(accepted[id], id).toBeUndefined(); continue; }
    expect(Number.isInteger(d.source.wgerId) && d.source.wgerId > 0, id).toBe(true);
    expect(d.source.author.trim(), id).not.toBe('');
    expect(d.source.licence, id).toMatch(/^(CC-BY-SA [34]\.0|CC-BY 4\.0|CC0 1\.0)$/);
    expect(accepted[id], id).toBe(d.source.wgerId);
  }
});

test('texts are plain, short and calm', () => {
  for (const [id, d] of entries) {
    expect(d.text, id).not.toMatch(/<[^>]+>|&[a-z#0-9]+;|https?:/i);
    expect(d.text, id).toBe(d.text.trim());
    expect(d.text.length, id).toBeGreaterThanOrEqual(80);
    expect(d.text.length, id).toBeLessThanOrEqual(420);
    const n = sentences(d.text).length;
    expect(n >= 2 && n <= 4, `${id}: ${n} sentences`).toBe(true);
    expect(d.text, id).not.toMatch(/Schmerz|Verletzung|Therapie|heilt|lindert|Fett|Kalorien|muss(t)? unbedingt/i);
    expect(d.text, id).not.toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihnen)\b/); // du, never Sie
  }
});

test('lookups: unknown ids have nothing, wger entries carry a credit line', () => {
  expect(exerciseDescription('a-user-made-uuid')).toBeNull();
  expect(exerciseDescription('hevy-template-123')).toBeNull();
  const squat = exerciseDescription('pf-squat')!;
  expect(descriptionCredit(squat)).toBe('Quelle: wger.de, CC-BY-SA 3.0');
  expect(descriptionCredit(exerciseDescription('pf-front-squat')!)).toBeNull();
});
