import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askClaude, ClaudeError, findClaude } from '../src/coach/claude-client';
import { answerJsonSchema, answerSchema } from '../src/coach/coach';

try {
  const bin = process.env.BIKE_CLAUDE_BIN ?? (await findClaude());
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-check-'));
  const out = await askClaude({ prompt: 'FTP 200 W. Schlage eine lockere Einheit von 30 Minuten vor.', systemPrompt: 'Du lieferst nur die verlangten Daten.', schema: answerJsonSchema, workDir, bin, model: 'haiku' });
  if (!answerSchema.safeParse(out).success) throw new ClaudeError('invalid', JSON.stringify(out));
  console.log('claude -p funktioniert');
} catch (e) {
  console.error(`claude -p funktioniert nicht: ${e instanceof ClaudeError ? e.kind : ''} ${(e as Error).message}`);
  process.exit(1);
}
