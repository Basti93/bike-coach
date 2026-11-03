import type { DayRating } from '../day-load';
import { dateKey, dateOf } from '../../shared/meals';
import type { PlannedRun } from '../../shared/run';
import { MIN_RUN_MIN, TEST_LOAD } from './limits';
import { MAX_TEXT, MIN_SHARE, runAnswerSchema } from './prompt';
import { countsText, TEST_NOTE, type RuleWeek } from './rules';

export const FORBIDDEN_WORDS = /rekord|bestzeit|streak|\bserien?\b|m(?:u|ü|ue)sst|pflicht|diagnos/i;

export type RunCheck = { ok: true; runs: PlannedRun[]; reason: string; note: string | null } | { ok: false; reason: string };

const addDays = (date: string, days: number): string => dateKey(dateOf(date, days));

class Refuse extends Error {}
const no = (reason: string): never => { throw new Refuse(reason); };

/** NFKC, lower case, and no zero-width or soft-hyphen characters, so look-alike spellings meet the word list. */
const normalized = (t: string): string => t.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '');
const shown = (t: string): string => t.slice(0, 20);

const text = (value: string | undefined, where: string, required: boolean): string | null => {
  const t = value?.trim() ?? '';
  if (t === '') return required ? no(`${where}: Text fehlt`) : null;
  if (t.length > MAX_TEXT) return no(`${where}: Text zu lang`);
  if (FORBIDDEN_WORDS.test(normalized(t))) return no(`${where}: Text enthält ein unpassendes Wort`);
  return t;
};

/**
 * Claude's week is accepted only inside the rule week's limits. `days` rates the days (hard, after legs) so that a moved
 * test or long run obeys the same day rules as the rule plan; a moved test or long run needs a rating for its date and the day before.
 */
export function checkRunWeek(raw: unknown, rule: RuleWeek, allowedDates: string[], days: Record<string, DayRating>): RunCheck {
  try {
    const parsed = runAnswerSchema.safeParse(raw);
    if (!parsed.success) return no('Antwort ungültig');
    const answer = parsed.data;
    const runs = answer.runs;
    if (runs.length > rule.runs.length) no('mehr Läufe als die Regelwoche');

    const rated = (d: string): boolean => days[d] !== undefined && days[addDays(d, -1)] !== undefined;
    const hard = (d: string): boolean => days[d]?.hardness === 'hard';
    const afterLegs = (d: string): boolean => days[addDays(d, -1)]?.legs === true;
    const ruleTest = rule.runs.find((r) => r.kind === 'test');
    const seen = new Set<string>();
    for (const run of runs) {
      if (!allowedDates.includes(run.date)) no(`${shown(run.date)}: Tag nicht erlaubt`);
      if (seen.has(run.date)) no(`${shown(run.date)}: zwei Läufe an einem Tag`);
      seen.add(run.date);
      if (!Number.isInteger(run.minutes) || run.minutes < MIN_RUN_MIN) no(`${shown(run.date)}: Minuten ungültig`);
      if (run.minutes > rule.maxRunMinutes) no(`${shown(run.date)}: Lauf länger als der längste der Regelwoche`);
    }

    const tests = runs.filter((r) => r.kind === 'test');
    const longs = runs.filter((r) => r.kind === 'long');
    for (const t of tests) {
      if (!ruleTest || rule.testDate === null || t.date !== rule.testDate || t.minutes !== ruleTest.minutes) no('Testlauf nur wie in der Regelwoche');
      if (!rated(t.date)) no('Testlauf ohne Tagesbewertung');
      if (hard(t.date) || afterLegs(t.date)) no('Testlauf nicht an einem harten Tag oder nach Beinarbeit');
      if (longs.some((l) => l.date === addDays(t.date, 1))) no('Testlauf nicht am Tag vor dem langen Lauf');
    }
    if (ruleTest && tests.length === 0) no('Testlauf der Regelwoche fehlt');
    if (longs.length > 0) {
      if (rule.phase !== 2 || !rule.runs.some((r) => r.kind === 'long')) no('kein langer Lauf in dieser Woche');
      if (longs.length > 1) no('nur ein langer Lauf');
      const long = longs[0]!;
      if (!rated(long.date)) no('langer Lauf ohne Tagesbewertung');
      if (hard(long.date) || afterLegs(long.date)) no('langer Lauf nicht an einem harten Tag oder nach Beinarbeit');
      if (tests.some((t) => addDays(t.date, 1) === long.date)) no('Testlauf nicht am Tag vor dem langen Lauf');
    }

    // Easy runs: no hard day the rule did not use, and no consecutive days unless the rule already had them.
    const ruleDates = new Set(rule.runs.map((r) => r.date));
    for (const run of runs) if (run.kind === 'easy' && hard(run.date) && !ruleDates.has(run.date)) no(`${shown(run.date)}: ruhiger Lauf nicht an einem harten Tag`);
    const touching = (dates: string[]): boolean => dates.some((d) => dates.includes(addDays(d, 1)));
    if (touching(runs.map((r) => r.date)) && !touching(rule.runs.map((r) => r.date))) no('Läufe an aufeinanderfolgenden Tagen');

    const total = runs.reduce((s, r) => s + r.minutes * (r.kind === 'test' ? TEST_LOAD : 1), 0);
    if (total > rule.totalMinutes) no('mehr Minuten als die Regelwoche');
    if (total < rule.totalMinutes * MIN_SHARE - 1e-9) no('weniger als 80 % der Regelwochenminuten');

    // The heart-rate cap and the "what counts" text always come from the rule; the trend sentence follows the rule week's hasTrend.
    const { hrCap, hasTrend } = rule;
    const planned: PlannedRun[] = [...runs].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => {
      const cap = r.kind === 'test' ? null : hrCap;
      return {
        date: r.date, kind: r.kind, minutes: r.minutes, hrCap: cap, counts: countsText(r.kind, r.minutes, cap, hasTrend),
        note: r.kind === 'test' ? TEST_NOTE : text(r.note, `${r.date}: Notiz`, false),
      };
    });
    return { ok: true, runs: planned, reason: text(answer.reason, 'Begründung', true)!, note: text(answer.note, 'Hinweis', false) };
  } catch (e) {
    if (e instanceof Refuse) return { ok: false, reason: e.message };
    throw e;
  }
}
