/**
 * Builds src/shared/fedb-exercises.json from a local clone of free-exercise-db (Unlicense).
 * Usage: npx tsx scripts/fedb-import.ts <path to dist/exercises.json>
 * Needs scripts/fedb-names-de.json (id -> German title) for every kept entry; fails loudly otherwise.
 * The English instructions stay in the source dataset (the app ships the German guides, fedb-descriptions-de.json).
 * Entries that a built-in names in `fedbId` are left out (the built-in wins).
 */
import fs from 'node:fs';
import { EXERCISES, exerciseTitles, type Exercise } from '../src/shared/exercises';

type Raw = { id: string; name: string; equipment: string | null; primaryMuscles: string[]; secondaryMuscles: string[]; category: string; instructions: string[] };

const KEEP = new Set(['strength', 'powerlifting', 'olympic weightlifting', 'strongman', 'plyometrics']);
const MUSCLE: Record<string, string> = { 'middle back': 'upper_back', 'lower back': 'lower_back', neck: 'traps' };
const EQUIPMENT: Record<string, string> = {
  'body only': 'none', cable: 'machine', machine: 'machine', 'e-z curl bar': 'barbell', barbell: 'barbell', dumbbell: 'dumbbell', kettlebells: 'kettlebell',
};
// equipment null (nothing listed) is a bodyweight move: 'none', reps_only. bands, balls, foam roll and the rest: 'other'.
const fedbId = (id: string) => `fedb-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const muscle = (m: string) => MUSCLE[m] ?? m;

const src = process.argv[2];
if (!src) throw new Error('usage: fedb-import.ts <path to exercises.json>');
const raw = JSON.parse(fs.readFileSync(src, 'utf8')) as Raw[];
const names = JSON.parse(fs.readFileSync(new URL('./fedb-names-de.json', import.meta.url), 'utf8')) as Record<string, string>;
const linked = new Set(EXERCISES.flatMap((e) => (e.fedbId ? [e.fedbId] : [])));
const builtIn = new Set(EXERCISES.flatMap(exerciseTitles).map((s) => s.toLowerCase()));

const out: Exercise[] = [];
const seen = new Map<string, string>();
const problems: string[] = [];
for (const r of raw) {
  if (!KEEP.has(r.category)) continue;
  const id = fedbId(r.id);
  if (linked.has(id)) continue;
  const title = names[id]?.trim();
  if (!title) { problems.push(`no German name: ${id}`); continue; }
  if (seen.has(title.toLowerCase())) problems.push(`duplicate name "${title}": ${id} and ${seen.get(title.toLowerCase())}`);
  seen.set(title.toLowerCase(), id);
  if (builtIn.has(title.toLowerCase()) ) problems.push(`collides with a built-in: ${id} (${title} / ${r.name})`);
  const equipment = r.equipment === null ? 'none' : (EQUIPMENT[r.equipment] ?? 'other');
  const primary = muscle(r.primaryMuscles[0] ?? 'other');
  const secondary = [...new Set(r.secondaryMuscles.map(muscle))].filter((m) => m !== primary);
  const e: Exercise = { id, title, type: equipment === 'none' ? 'reps_only' : 'weight_reps', primaryMuscle: primary, equipment, source: 'fedb' };
  // The English name is an alias for search, unless a built-in already logs under exactly that title (then the built-in owns it).
  if (!builtIn.has(r.name.toLowerCase())) e.aliases = [r.name];
  if (secondary.length > 0) e.secondaryMuscles = secondary;
  out.push(e);
}
const known = new Set(raw.map((r) => fedbId(r.id)));
for (const id of Object.keys(names)) if (!known.has(id)) problems.push(`name for unknown id: ${id}`);
for (const id of linked) if (!known.has(id)) problems.push(`built-in fedbId not in dataset: ${id}`);
if (problems.length > 0) { console.error(problems.join('\n')); process.exit(1); }
fs.writeFileSync(new URL('../src/shared/fedb-exercises.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${out.length} entries written`);
