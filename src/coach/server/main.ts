import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { askClaude, findClaude } from '../claude-client';
import { secretKeyFrom } from '../secrets/secret-box';
import { buildCoachServer } from './http';
import { Household } from './household';

const SCAN_MS = 10_000;
/** tmpfs: opened Garmin tokens live here only while a Python run lasts. */
const RUN_DIR = '/run/pandafit-secrets';
const HEX_TOKEN = /^[0-9a-f]{64}$/i;

export type CoachServerConfig = {
  port: number; host: string; root: string; secretKey: Buffer; internalToken: string; apiUrl: string;
  claudeBin: string | undefined; python: string; garminScripts: string;
  /** The restore drill: no scan, no Claude, no Hevy and no Garmin. */
  dry: boolean;
};

/** The coach container's settings. Throws without a valid key or internal token; the message never contains a value. */
export const readCoachServerConfig = (env: Record<string, string | undefined>): CoachServerConfig => {
  const secretKey = secretKeyFrom(env.PANDAFIT_SECRET_KEY);
  const internalToken = env.PANDAFIT_INTERNAL_TOKEN;
  if (typeof internalToken !== 'string' || !HEX_TOKEN.test(internalToken)) throw new Error('PANDAFIT_INTERNAL_TOKEN fehlt oder ist ungültig (64 Hex-Zeichen)');
  const port = Number(env.PORT ?? 8090);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('PORT ist ungültig');
  return {
    port, host: env.HOST ?? '0.0.0.0',
    root: env.PANDAFIT_COACH_DATA ?? '/data',
    secretKey, internalToken,
    apiUrl: env.PANDAFIT_API_INTERNAL ?? 'http://api:8081',
    claudeBin: env.BIKE_CLAUDE_BIN || undefined,
    python: env.PANDAFIT_GARMIN_PYTHON ?? '/opt/garmin-venv/bin/python',
    garminScripts: env.PANDAFIT_GARMIN_SCRIPTS ?? '/app/scripts/garmin',
    dry: env.PANDAFIT_COACH_DRY === '1',
  };
};

const run = (): void => {
  let config: CoachServerConfig;
  try { config = readCoachServerConfig(process.env); } catch (e) {
    console.error(`Coach startet nicht: ${(e as Error).message}`);
    process.exit(1);
  }
  const { dry } = config;
  const workDir = path.join(config.root, 'work');
  if (!dry) fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
  const refuse = (what: string) => () => { throw new Error(`${what} ist im Probelauf aus`); };
  const household = new Household({
    root: config.root, secretKey: config.secretKey, runDir: RUN_DIR,
    python: config.python, garminScripts: config.garminScripts,
    apiUrl: config.apiUrl, internalToken: config.internalToken,
    // askClaude ends every call at its timeout, so the household's one-at-a-time lock never stays held.
    ask: dry ? async () => refuse('Claude')() : async (input) => askClaude({ ...input, workDir, bin: config.claudeBin ?? (await findClaude()) }),
    ...(dry ? { spawnFn: refuse('Garmin') as never, fetchFn: (async () => refuse('Hevy')()) as never } : {}),
  });
  const app = buildCoachServer({ household, internalToken: config.internalToken });
  app.listen({ port: config.port, host: config.host }).then(() => {
    process.stdout.write(`Coach bereit auf Port ${config.port}${dry ? ' (Probelauf)' : ''}\n`);
    if (dry) return;
    household.scan();
    setInterval(() => household.scan(), SCAN_MS);
  }).catch((e: unknown) => {
    console.error(`Coach startet nicht: ${e instanceof Error ? e.message : 'Fehler'}`);
    process.exit(1);
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run();
