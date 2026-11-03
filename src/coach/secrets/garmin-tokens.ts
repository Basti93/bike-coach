import fs from 'node:fs';
import path from 'node:path';
import type { SecretCodec } from './secret-box';

const SAFE_ID = /^[A-Za-z0-9-]+$/;
const TOKEN_FILE = 'garmin_tokens.json';
const SEALED_FILE = `${TOKEN_FILE}.sealed`;

/**
 * Where a Python run finds the Garmin login of a profile. `checkout` gives the folder for `--tokens`, `checkin` ends that use.
 * Every checkout is followed by exactly one checkin, also when the run fails.
 */
export type GarminTokens = {
  has(id: string): boolean;
  mtimeMs(id: string): number | null;
  checkout(id: string): string;
  checkin(id: string): void;
  remove(id: string): void;
};

const safe = (id: string): string => {
  if (!SAFE_ID.test(id)) throw new Error('Ungültiges Profil');
  return id;
};

const mtimeOf = (file: string): number | null => {
  try { return fs.statSync(file).mtimeMs; } catch { return null; }
};

/** The Mac's way, as today: the program reads and writes `<garminDir>/tokens/<id>` itself. */
export const plainTokens = (garminDir: string): GarminTokens => {
  const dir = (id: string) => path.join(garminDir, 'tokens', safe(id));
  return {
    has: (id) => SAFE_ID.test(id) && fs.existsSync(path.join(dir(id), TOKEN_FILE)),
    mtimeMs: (id) => (SAFE_ID.test(id) ? mtimeOf(path.join(dir(id), TOKEN_FILE)) : null),
    checkout: (id) => dir(id),
    checkin: () => {},
    remove: (id) => { if (SAFE_ID.test(id)) fs.rmSync(dir(id), { recursive: true, force: true }); },
  };
};

type Checkout = { count: number; opened: string | null };

/**
 * Sealed at rest in `<garminDir>/tokens/<id>/garmin_tokens.json.sealed`. Opened into `<runDir>/<id>/` (tmpfs on the server) only while a run lasts,
 * sealed back when the program changed it, and wiped at the last checkin. Overlapping runs of one profile share the folder.
 */
export const sealedTokens = (opts: { garminDir: string; runDir: string; codec: (id: string) => SecretCodec }): GarminTokens => {
  const sealedFile = (id: string) => path.join(opts.garminDir, 'tokens', safe(id), SEALED_FILE);
  const runFolder = (id: string) => path.join(opts.runDir, safe(id));
  const open = new Map<string, Checkout>();

  const wipe = (id: string): void => { fs.rmSync(runFolder(id), { recursive: true, force: true }); };

  const sealBack = (id: string, text: string): void => {
    const target = sealedFile(id);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, opts.codec(id).seal(text), { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, target);
  };

  return {
    has: (id) => SAFE_ID.test(id) && fs.existsSync(sealedFile(id)),
    mtimeMs: (id) => (SAFE_ID.test(id) ? mtimeOf(sealedFile(id)) : null),

    checkout: (id) => {
      const dir = runFolder(id);
      const known = open.get(id);
      if (known) { known.count += 1; return dir; }
      fs.mkdirSync(opts.runDir, { recursive: true, mode: 0o700 });
      fs.chmodSync(opts.runDir, 0o700);
      wipe(id);
      fs.mkdirSync(dir, { mode: 0o700 });
      fs.chmodSync(dir, 0o700);
      let opened: string | null = null;
      try {
        let stored: string | null = null;
        try { stored = fs.readFileSync(sealedFile(id), 'utf8'); } catch { /* no login yet: an empty folder for the login */ }
        if (stored !== null) {
          opened = opts.codec(id).open(stored.trim());
          const file = path.join(dir, TOKEN_FILE);
          fs.writeFileSync(file, opened, { mode: 0o600, flag: 'wx' });
          fs.chmodSync(file, 0o600);
        }
      } catch {
        wipe(id);
        // Deliberately without the cause: it must never carry a token.
        throw new Error('Garmin-Zugang lässt sich nicht öffnen');
      }
      open.set(id, { count: 1, opened });
      return dir;
    },

    checkin: (id) => {
      if (!SAFE_ID.test(id)) return;
      const known = open.get(id);
      if (!known) return;
      known.count -= 1;
      if (known.count > 0) return;
      open.delete(id);
      try {
        let text: string | null = null;
        try { text = fs.readFileSync(path.join(runFolder(id), TOKEN_FILE), 'utf8'); } catch { /* the program wrote nothing */ }
        if (text !== null && text !== known.opened) sealBack(id, text);
      } catch {
        throw new Error('Garmin-Zugang lässt sich nicht speichern');
      } finally {
        wipe(id);
      }
    },

    remove: (id) => {
      if (!SAFE_ID.test(id)) return;
      open.delete(id);
      wipe(id);
      fs.rmSync(path.join(opts.garminDir, 'tokens', id), { recursive: true, force: true });
    },
  };
};
