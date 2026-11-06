import { ClaudeError, type ClaudeErrorKind } from './claude-client';

/** Waiting in the service's queue (up to 120 s) plus a reserve, on top of the run time the coach allows. */
const WAIT_RESERVE_MS = 130_000;
const DEFAULT_RUN_MS = 180_000;
export const remoteTimeoutMs = (timeoutMs: number | undefined): number => (timeoutMs ?? DEFAULT_RUN_MS) + WAIT_RESERVE_MS;

const KINDS: Record<string, [ClaudeErrorKind, string]> = {
  plan_limit: ['limit', 'Das Plan-Limit ist erreicht.'],
  client_limit: ['failed', 'Tageslimit des Coaches im KI-Dienst erreicht.'],
  busy: ['timeout', 'Der KI-Dienst ist gerade belegt.'],
  timeout: ['timeout', 'claude hat nicht rechtzeitig geantwortet.'],
  invalid: ['invalid', 'Claude lieferte keine gültigen Daten.'],
  unauthorized: ['failed', 'Der KI-Dienst kennt das Token des Coaches nicht.'],
};

/**
 * askClaude through the home server's AI service (heimserver ki/README.md). Same input and result as askClaude.
 * Never falls back to a local claude: two copies of one login would invalidate each other.
 */
export const askRemote = async (
  input: { prompt: string; systemPrompt: string; schema: object; timeoutMs?: number; model?: string },
  cfg: { url: string; token: string; fetchFn?: typeof fetch },
): Promise<unknown> => {
  let res: Response;
  try {
    res = await (cfg.fetchFn ?? fetch)(`${cfg.url}/v1/ask`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: input.prompt, system: input.systemPrompt, schema: input.schema,
        max_seconds: Math.ceil((input.timeoutMs ?? DEFAULT_RUN_MS) / 1000),
        ...(input.model ? { model: input.model } : {}),
      }),
      signal: AbortSignal.timeout(remoteTimeoutMs(input.timeoutMs)),
    });
  } catch (e) {
    const name = (e as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new ClaudeError('timeout', 'Der KI-Dienst hat nicht rechtzeitig geantwortet.');
    throw new ClaudeError('failed', `KI-Dienst nicht erreichbar: ${(e as Error).message}`.slice(0, 200));
  }
  let json: { status?: string; output?: unknown; message?: string } = {};
  try { json = await res.json(); } catch { /* treated as failed below */ }
  if (res.ok && json.status === 'ok') {
    if (json.output === undefined) throw new ClaudeError('invalid', 'Die Antwort enthielt keine strukturierten Daten.');
    return json.output;
  }
  const [kind, message] = KINDS[json.status ?? ''] ?? ['failed', `KI-Dienst: HTTP ${res.status} ${json.message ?? ''}`.trim().slice(0, 200)];
  throw new ClaudeError(kind, message);
};
