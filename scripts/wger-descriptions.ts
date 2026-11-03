// Helper for src/shared/exercise-descriptions.ts: German exercise texts from wger (https://wger.de, data CC-BY-SA and others per entry).
//
//   npx tsx scripts/wger-descriptions.ts propose [cacheFile]  downloads once (cached), prints match proposals for own exercises
//   npx tsx scripts/wger-descriptions.ts show [cacheFile]     prints the stripped wger text for every accepted match
//   npx tsx scripts/wger-descriptions.ts check [cacheFile]    compares source, author and licence in the descriptions file with wger
//
// Names alone are not trusted: every proposal was reviewed by hand (same movement, same equipment), and the accepted ones are
// recorded in scripts/wger-matches.json. The texts in the descriptions file are shortened and lightly adapted by hand from the
// output of `show`, so a rerun gives the same sources but does not overwrite the texts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXERCISE_DESCRIPTIONS } from '../src/shared/exercise-descriptions';
import { EXERCISES, type Exercise } from '../src/shared/exercises';

const API = 'https://wger.de/api/v2/exerciseinfo/';
const UA = 'Pandafit exercise descriptions script (open source fitness app, one-off download)';
const GERMAN = 1;
const LICENCES: Record<number, string> = { 1: 'CC-BY-SA 3.0', 2: 'CC-BY-SA 4.0', 3: 'CC0 1.0', 4: 'CC-BY 4.0', 5: 'ODbL' };

export type WgerGerman = { exerciseId: number; name: string; html: string; author: string; licence: string; equipment: string[]; category: string };

type Info = {
  id: number; category: { name: string }; equipment: { name: string }[];
  translations: { name: string; description: string; language: number; license: number; license_author: string }[];
};

async function download(cache: string): Promise<WgerGerman[]> {
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8')) as WgerGerman[];
  const out: WgerGerman[] = [];
  let url: string | null = `${API}?limit=200`;
  while (url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`wger ${res.status} for ${url}`);
    const page = (await res.json()) as { next: string | null; results: Info[] };
    for (const info of page.results) {
      for (const t of info.translations) {
        if (t.language !== GERMAN) continue;
        out.push({ exerciseId: info.id, name: t.name.trim(), html: t.description, author: (t.license_author ?? '').trim(), licence: LICENCES[t.license] ?? `licence ${t.license}`, equipment: info.equipment.map((e) => e.name), category: info.category.name });
      }
    }
    console.error(`${out.length} German translations so far`);
    url = page.next;
    if (url) await new Promise((r) => setTimeout(r, 1500)); // polite
  }
  fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

export const stripHtml = (html: string): string => html
  .replace(/<\/(p|li|h\d)>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();

const norm = (s: string): string[] => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['mit', 'der', 'die', 'das', 'und', 'dem', 'den', 'ohne', 'auf', 'the'].includes(w));

/** Own equipment to the wger equipment names that fit it. Empty: anything goes. */
const EQUIP: Record<string, string[]> = {
  barbell: ['Barbell', 'SZ-Bar'], dumbbell: ['Dumbbell'], kettlebell: ['Kettlebell'], machine: ['Cable machine'], none: ['none (bodyweight exercise)', 'Pull-up bar', 'Gym mat', 'Bench'], other: [],
};

function score(e: Exercise, w: WgerGerman): number {
  const a = new Set([...norm(e.title), ...norm(e.hevyTitle ?? '')]);
  const b = norm(w.name);
  if (b.length === 0) return 0;
  let hit = 0;
  for (const t of b) if ([...a].some((x) => x === t || (x.length > 4 && t.includes(x)) || (t.length > 4 && x.includes(t)))) hit++;
  let s = hit / Math.max(b.length, 1);
  const want = EQUIP[e.equipment] ?? [];
  if (want.length && w.equipment.length && !w.equipment.some((q) => want.includes(q))) s -= 0.5;
  if (stripHtml(w.html).length < 60) s -= 0.3;
  return s;
}

const matchesFile = path.join(import.meta.dirname, 'wger-matches.json');
const readMatches = (): Record<string, number> => (JSON.parse(fs.readFileSync(matchesFile, 'utf8')) as { accepted: Record<string, number> }).accepted;

const [mode = 'propose', cacheArg] = process.argv.slice(2);
const data = await download(cacheArg ?? path.join(os.tmpdir(), 'pandafit-wger-de.json'));

if (mode === 'propose') {
  for (const e of EXERCISES) {
    const best = data.map((w) => ({ w, s: score(e, w) })).filter((x) => x.s > 0.3).sort((x, y) => y.s - x.s).slice(0, 4);
    console.log(`\n${e.id}  ${e.title} [${e.equipment}]`);
    for (const { w, s } of best) console.log(`  ${s.toFixed(2)}  #${w.exerciseId} ${w.name} [${w.equipment.join(', ')}] ${stripHtml(w.html).slice(0, 110)}`);
  }
} else if (mode === 'show') {
  for (const [own, id] of Object.entries(readMatches())) {
    const w = data.find((x) => x.exerciseId === id);
    console.log(`\n${own} -> #${id} ${w?.name} (${w?.author}, ${w?.licence})\n  ${w ? stripHtml(w.html) : 'MISSING'}`);
  }
} else if (mode === 'check') {
  let bad = 0;
  const matches = readMatches();
  for (const [own, d] of Object.entries(EXERCISE_DESCRIPTIONS)) {
    const src = d.source;
    if (src.kind !== 'wger') { if (matches[own] !== undefined) { console.log(`${own}: matched in wger-matches.json but own text`); bad++; } continue; }
    const w = data.find((x) => x.exerciseId === src.wgerId);
    if (matches[own] !== src.wgerId) { console.log(`${own}: wger id ${src.wgerId} not the accepted match`); bad++; }
    if (!w || w.author !== src.author || w.licence !== src.licence) { console.log(`${own}: author or licence differ from wger (${w?.author}, ${w?.licence})`); bad++; }
  }
  console.log(bad ? `${bad} problems` : 'all sources match wger');
  process.exitCode = bad ? 1 : 0;
}
