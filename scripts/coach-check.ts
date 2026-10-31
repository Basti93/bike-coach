import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askClaude, ClaudeError, findClaude } from '../src/coach/claude-client';

const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
try {
  const bin = process.env.BIKE_CLAUDE_BIN ?? (await findClaude());
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-check-'));
  const out = await askClaude({ prompt: 'Antworte mit ok true.', systemPrompt: 'Du lieferst nur die verlangten Daten.', schema, workDir, bin, model: 'haiku' });
  if ((out as { ok?: boolean }).ok !== true) throw new ClaudeError('invalid', JSON.stringify(out));
  console.log('claude -p funktioniert');
} catch (e) {
  console.error(`claude -p funktioniert nicht: ${e instanceof ClaudeError ? e.kind : ''} ${(e as Error).message}`);
  process.exit(1);
}
