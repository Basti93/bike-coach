import type { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseProfile, type Profile } from '../../shared/profiles';
import { MealCoach } from '../meals/meal-coach';
import { createCoachRuntime, type CoachRuntime } from '../runtime';
import { sealedTokens } from '../secrets/garmin-tokens';
import { sealedCodec } from '../secrets/secret-box';
import { computeTogether, type Together } from '../together';
import type { RecordStore } from '../tracking/store';
import { HeavyLock, inQuietHours } from './heavy';
import { internalLinks } from './internal-links';

type Ask = (input: { prompt: string; systemPrompt: string; schema: object; timeoutMs?: number }) => Promise<unknown>;

export type HouseholdOptions = {
  /** Holds `accounts/<id>/` and `household/meals/`. */
  root: string;
  secretKey: Buffer;
  /** tmpfs for opened Garmin tokens; each account gets its own folder inside. */
  runDir: string;
  python: string;
  garminScripts: string;
  /** The api's internal listener, e.g. `http://api:8081`. */
  apiUrl: string;
  internalToken: string;
  ask: Ask;
  nowMs?: () => number;
  /** For tests: Garmin runs, Hevy requests and how long a finished ride waits for feedback. */
  spawnFn?: typeof spawn;
  fetchFn?: typeof fetch;
  waitMs?: number;
};

export type AccountCoach = {
  accountId: number;
  profileId: string;
  runtime: CoachRuntime;
  profile(): Profile;
  /** Keeps `profile.json`. The profile id stays the one bound to the account. */
  setProfile(p: Profile): void;
};

const SAFE_ID = /^[A-Za-z0-9-]+$/;
const ACCOUNT_DIR = /^[1-9][0-9]{0,15}$/;

const readProfile = (file: string): Profile | null => {
  try {
    const p = parseProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
    return SAFE_ID.test(p.id) ? p : null;
  } catch { return null; }
};

const writeJson = (file: string, data: unknown): void => {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data));
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
};

/**
 * The server's coach: one runtime per moved account, each in its own folder, so one account never reads the other's rides, health data,
 * notes, complaints or secrets. Only the meal plan and the together page are shared, and they return only their combined result.
 * Every Claude call of every coach goes through one lock; Hevy and Garmin wait while it is busy, and scan-driven runs pause at night.
 */
export class Household {
  private readonly accounts = new Map<number, AccountCoach>();
  private readonly lock = new HeavyLock();
  private readonly nowMs: () => number;
  private readonly ask: Ask;
  private mealCoach: MealCoach | null = null;

  constructor(private readonly opts: HouseholdOptions) {
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.ask = (input) => this.lock.run(() => opts.ask(input));
  }

  private accountDir(accountId: number): string { return path.join(this.opts.root, 'accounts', String(accountId)); }
  private mealsDir(): string { return path.join(this.opts.root, 'household', 'meals'); }
  private quiet(): boolean { return inQuietHours(this.nowMs()); }

  /** The account's coach, started on first use once the account moved. Null otherwise. */
  account(accountId: number): AccountCoach | null {
    const known = this.accounts.get(accountId);
    if (known) return known;
    this.start(accountId);
    return this.accounts.get(accountId) ?? null;
  }

  /** Starts the account's coach when it moved and has a valid profile. Safe to repeat. */
  start(accountId: number): void {
    if (!Number.isSafeInteger(accountId) || accountId <= 0 || this.accounts.has(accountId)) return;
    const dir = this.accountDir(accountId);
    if (!fs.existsSync(path.join(dir, 'moved.json'))) return;
    const profileFile = path.join(dir, 'profile.json');
    const first = readProfile(profileFile);
    if (!first) return;
    const profileId = first.id;
    // One profile belongs to one account: a second account with the same id gets no coach.
    if (this.byProfile(profileId)) return;
    let current = first;
    const { secretKey, runDir } = this.opts;
    const runtime = createCoachRuntime({
      root: dir,
      profiles: () => [current],
      // No ride is ever open on the server.
      noOpenRide: () => true,
      scheduled: () => !this.quiet(),
      heavyBusy: () => this.lock.busy(),
      ask: this.ask,
      python: this.opts.python,
      garminScripts: this.opts.garminScripts,
      links: internalLinks({ apiUrl: this.opts.apiUrl, token: this.opts.internalToken, accountId, profileId, dir: path.join(dir, 'links'), nowMs: this.nowMs }),
      // Asked on every use: null until the household's meals moved, then the one shared MealCoach.
      meals: () => this.openMeals(),
      together: () => this.together(),
      nowMs: this.nowMs,
      hevyCodec: () => sealedCodec(secretKey, `${accountId}:hevy`),
      garminTokens: sealedTokens({
        garminDir: path.join(dir, 'garmin'),
        runDir: path.join(runDir, String(accountId)),
        codec: () => sealedCodec(secretKey, `${accountId}:garmin`),
      }),
      ...(this.opts.spawnFn ? { spawnFn: this.opts.spawnFn } : {}),
      ...(this.opts.fetchFn ? { fetchFn: this.opts.fetchFn } : {}),
      ...(this.opts.waitMs !== undefined ? { waitMs: this.opts.waitMs } : {}),
    });
    this.accounts.set(accountId, {
      accountId, profileId, runtime,
      profile: () => current,
      setProfile: (p) => {
        const next = parseProfile(p);
        if (next.id !== profileId) throw new Error('Anderes Profil');
        writeJson(profileFile, next);
        current = next;
      },
    });
  }

  /** Starts every moved account, then runs each coach's scan and the shared meal plan. */
  scan(): void {
    let names: string[] = [];
    try { names = fs.readdirSync(path.join(this.opts.root, 'accounts')); } catch { /* no account yet */ }
    for (const name of names) if (ACCOUNT_DIR.test(name)) { try { this.start(Number(name)); } catch { /* try again on the next scan */ } }
    for (const a of this.accounts.values()) a.runtime.scan();
    // Separate safeguard: the meal plan must never disturb the coaches. It runs only once moved. At night it answers a person's
    // chat message but does not make the scheduled weekly plan.
    const mc = this.openMeals();
    if (mc) void mc.tick({ plan: !this.quiet() }).catch(() => {});
  }

  /** Both accounts' derived values only: no note, complaint, ride id or health value. */
  together(): Together {
    const people: Profile[] = [];
    const states = [];
    for (const a of this.accounts.values()) {
      const s = a.runtime.coachState(a.profileId);
      people.push(a.profile());
      if (s) states.push(s);
    }
    return computeTogether(people, states, this.nowMs());
  }

  private byProfile(profileId: string): AccountCoach | null {
    for (const a of this.accounts.values()) if (a.profileId === profileId) return a;
    return null;
  }

  /** The shared MealCoach once `household/meals/moved.json` exists, else null. Made on first use, so nothing is read before the move. */
  private openMeals(): MealCoach | null {
    if (!fs.existsSync(path.join(this.mealsDir(), 'moved.json'))) return null;
    if (this.mealCoach) return this.mealCoach;
    // Each profile's records go to its own account's store, never another's.
    const store: Pick<RecordStore, 'all' | 'putMany'> = {
      all: (id, kind) => { const a = this.byProfile(id); return a ? a.runtime.records.all(id, kind) : []; },
      putMany: (id, records, from) => {
        const a = this.byProfile(id);
        if (!a) throw new Error('Unbekanntes Profil');
        return a.runtime.records.putMany(id, records, from);
      },
    };
    this.mealCoach = new MealCoach({
      dir: this.mealsDir(), nowMs: this.nowMs,
      profiles: () => [...this.accounts.values()].map((a) => { const { id, name, avatar } = a.profile(); return { id, name, ...(avatar ? { avatar } : {}) }; }),
      noOpenRide: () => true,
      ask: this.ask,
      trainingDays: (id) => this.byProfile(id)?.runtime.trainingDays(id) ?? [],
      store,
      // Every moved account syncs its records with the api.
      linked: (id) => this.byProfile(id) !== null,
      // The records sync goes soon, and subscribers get the new view at once.
      onExport: (touched) => {
        for (const id of touched) {
          const a = this.byProfile(id);
          if (!a) continue;
          a.runtime.accountSync.touch(id);
          a.runtime.notify(id);
        }
      },
    });
    return this.mealCoach;
  }
}
