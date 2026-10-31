import { exec as nodeExec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

export type ClaudeErrorKind = 'missing' | 'limit' | 'timeout' | 'invalid' | 'failed';
export class ClaudeError extends Error {
  constructor(public kind: ClaudeErrorKind, message: string) { super(message); }
}

const LIMIT = /usage limit|limit reached|hit your .*limit/i;
const NOT_PLAN_LIMIT = /not your usage limit/i;
const isLimit = (text: string) => LIMIT.test(text) && !NOT_PLAN_LIMIT.test(text);
const DEFAULT_TIMEOUT_MS = 180_000;
const KILL_GRACE_MS = 2000;

/** Aus dem Finder gestartete Apps kennen den PATH der Shell nicht. */
export const findClaude = async (exec: (cmd: string) => Promise<string> = defaultExec): Promise<string> => {
  let out = '';
  try {
    out = await exec(`${process.env.SHELL ?? '/bin/zsh'} -lc 'command -v claude'`);
  } catch { /* unten als fehlend gemeldet */ }
  const bin = out.trim().split('\n').pop() ?? '';
  if (!bin) throw new ClaudeError('missing', 'claude wurde nicht gefunden.');
  return bin;
};
const defaultExec = async (cmd: string) => (await promisify(nodeExec)(cmd, { timeout: 10_000 })).stdout;

type ClaudeOutput = { structured_output?: unknown; is_error?: boolean; subtype?: string; result?: unknown; errors?: unknown };
const parseOutput = (stdout: string): ClaudeOutput | null => {
  try { return JSON.parse(stdout) as ClaudeOutput; } catch { return null; }
};

export const askClaude = (input: {
  prompt: string; systemPrompt: string; schema: object; workDir: string; bin: string; timeoutMs?: number; model?: string; spawnFn?: typeof spawn;
}): Promise<unknown> => new Promise((resolve, reject) => {
  // Bewusst ohne --bare: Dieser Modus liest den Abo-Login nicht.
  const args = [
    '-p', input.prompt, '--system-prompt', input.systemPrompt,
    '--output-format', 'json', '--json-schema', JSON.stringify(input.schema),
    '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    ...(input.model ? ['--model', input.model] : []),
  ];
  const child = (input.spawnFn ?? spawn)(input.bin, args, { cwd: input.workDir, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (fn: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    fn();
  };
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
    finish(() => reject(new ClaudeError('timeout', 'claude hat nicht rechtzeitig geantwortet.')));
  }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  child.stdout?.on('data', (d) => { stdout += String(d); });
  child.stderr?.on('data', (d) => { stderr += String(d); });
  child.on('error', (e: NodeJS.ErrnoException) => finish(() => reject(new ClaudeError(e.code === 'ENOENT' ? 'missing' : 'failed', e.message))));
  child.on('close', (code) => finish(() => {
    // Erst das JSON auswerten: Eine gültige Antwort darf „Limit“ oder die Zahl 429 enthalten.
    const parsed = parseOutput(stdout);
    if (code !== 0 || parsed?.is_error) {
      if (parsed?.subtype === 'error_max_structured_output_retries') return reject(new ClaudeError('invalid', 'Claude lieferte keine gültigen Daten.'));
      const text = parsed ? `${String(parsed.result ?? '')} ${JSON.stringify(parsed.errors ?? '')} ${stderr}` : `${stdout} ${stderr}`;
      if (isLimit(text)) return reject(new ClaudeError('limit', 'Das Plan-Limit ist erreicht.'));
      return reject(new ClaudeError('failed', `claude endete mit Code ${code}: ${text.trim().slice(0, 200)}`));
    }
    if (!parsed) return reject(new ClaudeError('invalid', 'Die Antwort war kein JSON.'));
    if (parsed.structured_output === undefined) return reject(new ClaudeError('invalid', 'Die Antwort enthielt keine strukturierten Daten.'));
    resolve(parsed.structured_output);
  }));
});
