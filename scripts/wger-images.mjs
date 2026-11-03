// One-off: pictures for the exercises whose description comes from wger (https://wger.de).
//
//   node scripts/wger-images.mjs [maxPerExercise]
//
// For every wger-sourced entry in src/shared/exercise-descriptions.ts it asks the public wger API for that exercise's
// images and keeps only those under CC BY-SA (any version) or CC0. AI-generated images are skipped (their copyright is
// unclear). At most `maxPerExercise` (default 2) per exercise, main image first, scaled to at most 480 px wide with
// sips (macOS; without sips the originals are kept). Files go to src/web/public/exercises/ (served by the web app and,
// via the renderer's publicDir, by the Mac app); the credits go to src/shared/exercise-images.ts.
// Nothing is loaded from wger at runtime.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DESCRIPTIONS = path.join(ROOT, 'src/shared/exercise-descriptions.ts');
const OUT_DIR = path.join(ROOT, 'src/web/public/exercises');
const OUT_TS = path.join(ROOT, 'src/shared/exercise-images.ts');
const API = 'https://wger.de/api/v2/exerciseinfo/';
const UA = 'Pandafit exercise images script (open source fitness app, one-off download)';
const MAX_WIDTH = 480;
const max = Number(process.argv[2] ?? 2);
/** wger licence ids that may be bundled: share-alike with attribution, or public domain. 4 (CC BY) and 5 (ODbL) are left out. */
const LICENCES = { 1: 'CC-BY-SA 3.0', 2: 'CC-BY-SA 4.0', 3: 'CC0 1.0' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasSips = (() => { try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** Own exercise id to wger id, from the w(text, wgerId, author, licence) entries. */
function wgerSourced() {
  const src = fs.readFileSync(DESCRIPTIONS, 'utf8');
  const out = [];
  for (const m of src.matchAll(/^\s*'([^']+)': w\('(?:[^'\\]|\\.)*', (\d+), '/gm)) out.push([m[1], Number(m[2])]);
  return out;
}

/** Writes the picture as a JPEG at most MAX_WIDTH wide (transparency becomes white). Without sips the original is kept. */
function store(bytes, base, ext) {
  if (!hasSips) {
    fs.writeFileSync(path.join(OUT_DIR, base + ext), bytes);
    return base + ext;
  }
  const tmp = path.join(OUT_DIR, `.download${ext}`);
  fs.writeFileSync(tmp, bytes);
  const width = Number(/pixelWidth: (\d+)/.exec(execFileSync('sips', ['-g', 'pixelWidth', tmp], { encoding: 'utf8' }))?.[1] ?? 0);
  const resize = width > MAX_WIDTH ? ['--resampleWidth', String(MAX_WIDTH)] : [];
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '75', ...resize, tmp, '--out', path.join(OUT_DIR, `${base}.jpg`)], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  return `${base}.jpg`;
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = {};
  let bytes = 0;
  for (const [ownId, wgerId] of wgerSourced()) {
    const res = await fetch(`${API}${wgerId}/`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`wger ${res.status} for exercise ${wgerId}`);
    const info = await res.json();
    const ok = (info.images ?? [])
      .filter((img) => LICENCES[img.license] && !img.is_ai_generated)
      .sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.id - b.id);
    const seen = new Set();
    for (const img of ok) {
      if (seen.size >= max) break;
      const r = await fetch(img.image, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`wger ${r.status} for ${img.image}`);
      const raw = Buffer.from(await r.arrayBuffer());
      const hash = createHash('sha256').update(raw).digest('hex');
      if (seen.has(hash)) continue; // wger sometimes holds the same picture twice
      seen.add(hash);
      const ext = path.extname(new URL(img.image).pathname).toLowerCase() || '.png';
      const file = store(raw, `${ownId}-${seen.size}`, ext);
      bytes += fs.statSync(path.join(OUT_DIR, file)).size;
      (map[ownId] ??= []).push({ file: `exercises/${file}`, author: (img.license_author ?? '').trim() || 'wger.de', licence: LICENCES[img.license], sourceUrl: `https://wger.de/en/exercise/${wgerId}/view/` });
      await sleep(300);
    }
    console.error(`${ownId} (wger ${wgerId}): ${map[ownId]?.length ?? 0} of ${(info.images ?? []).length} images`);
    await sleep(800); // polite
  }
  const body = Object.entries(map).map(([id, list]) => `  ${JSON.stringify(id)}: [\n${list.map((x) => `    ${JSON.stringify(x)},`).join('\n')}\n  ],`).join('\n');
  fs.writeFileSync(OUT_TS, `/**
 * Pictures for own exercises, from the wger Workout Manager exercise database (https://wger.de). Bundled as static
 * files under exercises/ (src/web/public/exercises), nothing is loaded from wger at runtime. Only CC BY-SA and CC0
 * images; author and licence of each one are shown in the app. Generated by scripts/wger-images.mjs, do not edit.
 */
export type ExerciseImage = { file: string; author: string; licence: string; sourceUrl: string };

export const EXERCISE_IMAGES: Record<string, ExerciseImage[]> = {
${body}
};
`);
  console.error(`${Object.keys(map).length} exercises with pictures, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

await main();
