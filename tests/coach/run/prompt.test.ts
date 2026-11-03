import { buildRunPrompt, RUN_SYSTEM_PROMPT, runAnswerJsonSchema, runAnswerSchema } from '../../../src/coach/run/prompt';
import type { RuleWeek } from '../../../src/coach/run/rules';
import type { RunNumbers } from '../../../src/shared/run';

const RULE: RuleWeek = {
  runs: [{ date: '2027-06-15', kind: 'easy', minutes: 30, hrCap: 140, counts: 'x', note: null }],
  reason: 'Phase „wieder fit“: Ruhige Läufe.', phase: 1, totalMinutes: 30, maxRunMinutes: 30, testDate: null,
};
const NUMBERS: RunNumbers = { easyPace: { now: 400, weeks4: 410, weeks12: null, trend: [] }, weeks: [], longest: { blockKm: null, lastBlockKm: null }, tests: [] };

test('the prompt carries the rule week and numbers as data and no complaint text', () => {
  const p = buildRunPrompt({
    rule: RULE, runs: [], numbers: NUMBERS, complaint: 'half',
    days: { '2027-06-16': { date: '2027-06-16', hardness: 'hard', legs: true, minutes: 60 } },
  });
  expect(p).toContain('<regelwoche-nur-daten>');
  expect(p).toContain('"totalMinutes":30');
  expect(p).toContain('<zahlen-nur-daten>');
  expect(p).toContain('"hardness":"hard"');
  expect(p).toContain('half');
  expect(p).not.toMatch(/ablehnung/);
  expect(p).not.toContain('Knie');
  const q = buildRunPrompt({ rule: RULE, runs: [], numbers: NUMBERS, complaint: null, days: {}, rejection: 'zu viel <b>' });
  expect(q).toContain('<ablehnung-nur-daten>');
  expect(q).not.toContain('<b>');
});

test('RUN_SYSTEM_PROMPT says distance before speed and no records on ordinary runs', () => {
  expect(RUN_SYSTEM_PROMPT).toMatch(/Distanz vor Tempo/);
  expect(RUN_SYSTEM_PROMPT).toMatch(/keine Rekorde|keinen Rekord/i);
  expect(RUN_SYSTEM_PROMPT).toMatch(/Diagnose/);
});

test('the JSON schema has no $schema and the zod schema accepts an optional note', () => {
  expect('$schema' in runAnswerJsonSchema).toBe(false);
  expect(runAnswerSchema.safeParse({ runs: [{ date: '2027-06-15', kind: 'easy', minutes: 30 }], reason: 'a' }).success).toBe(true);
});
