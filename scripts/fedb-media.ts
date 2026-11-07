/**
 * Copies the pictures of the base catalog (free-exercise-db, Unlicense) from a local clone into src/web/public/exercises/fedb,
 * scaled to 480 px with macOS `sips`. The folder is gitignored: the pictures are generated, never committed.
 * Usage: npm run media:fedb   (clone: $FEDB_DIR or ~/Projects/pandafit-references/free-exercise-db)
 * Existing files are skipped; without the clone it prints a note and exits 0.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mediaPlan, type MediaEntry } from './fedb-media-plan';

const clone = process.env.FEDB_DIR ?? path.join(os.homedir(), 'Projects/pandafit-references/free-exercise-db');
const source = path.join(clone, 'exercises');
if (!fs.existsSync(source)) {
  console.log(`media:fedb: no free-exercise-db clone at ${clone}, skipped (the app works without the pictures)`);
  process.exit(0);
}
const root = new URL('../src/web/public/', import.meta.url).pathname;
const entries = JSON.parse(fs.readFileSync(new URL('../src/shared/fedb-exercises.json', import.meta.url), 'utf8')) as MediaEntry[];
let made = 0, skipped = 0, missing = 0, failed = 0;
for (const { from, to } of mediaPlan(entries)) {
  const dest = path.join(root, to);
  if (fs.existsSync(dest)) { skipped++; continue; }
  const src = path.join(source, from);
  if (!fs.existsSync(src)) { missing++; continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { execFileSync('sips', ['-Z', '480', src, '--out', dest], { stdio: 'ignore' }); made++; } catch { failed++; fs.rmSync(dest, { force: true }); }
}
console.log(`media:fedb: ${made} made, ${skipped} already there, ${missing} missing in the clone, ${failed} failed`);
