import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const openDb = (path: string): DatabaseSync => {
  if (path !== ':memory:') {
    // Private data directory and files (umask is not available in worker threads, so it is best effort).
    try { process.umask(0o077); } catch { /* not supported here */ }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(path, { timeout: 5000 });
  const hadMealWeeks = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'push_meal_weeks'").get();
  const hadRunWeeks = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'push_run_weeks'").get();
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, expires_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS records (account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, deleted INTEGER NOT NULL, body TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (account_id, kind, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (account_id, seq);
    CREATE TABLE IF NOT EXISTS overwritten (n INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, updated_ms REAL NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, stale INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS login_attempts (at_ms INTEGER NOT NULL, ip TEXT NOT NULL, account_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, account_id INTEGER NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, session_hash TEXT, device_id INTEGER, created_ms INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS push_subs_account ON push_subs (account_id);
    CREATE TABLE IF NOT EXISTS push_meal_weeks (account_id INTEGER NOT NULL, week TEXT NOT NULL, PRIMARY KEY (account_id, week));
    CREATE TABLE IF NOT EXISTS push_run_weeks (account_id INTEGER NOT NULL, week TEXT NOT NULL, PRIMARY KEY (account_id, week));`);
  // Weeks already stored before notifications existed count as announced, so a later resend does not notify.
  if (!hadMealWeeks) {
    db.exec(`INSERT OR IGNORE INTO push_meal_weeks SELECT account_id, substr(id, 6) FROM records
      WHERE kind = 'mealplan' AND deleted = 0 AND id GLOB 'week-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`);
  }
  if (!hadRunWeeks) {
    db.exec(`INSERT OR IGNORE INTO push_run_weeks SELECT account_id, substr(id, 6) FROM records
      WHERE kind = 'run' AND deleted = 0 AND id GLOB 'week-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND json_extract(body, '$.announce') = 1`);
  }
  // A database from before these columns gets them here.
  const columns = (db.prepare('PRAGMA table_info(overwritten)').all() as { name: string }[]).map((c) => c.name);
  for (const c of ['deleted', 'stale']) if (!columns.includes(c)) db.exec(`ALTER TABLE overwritten ADD COLUMN ${c} INTEGER NOT NULL DEFAULT 0`);
  settleGeneration(db);
  return db;
};

const metaValue = (db: DatabaseSync, key: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
const writeGeneration = (db: DatabaseSync) => {
  db.prepare("INSERT OR REPLACE INTO meta VALUES ('generation', ?)").run(randomBytes(16).toString('hex'));
  db.exec("DELETE FROM meta WHERE key = 'from_backup'");
};

/**
 * The id of this database's history: devices start over when it changes. Created once. A backup file carries the
 * `from_backup` mark (see backup.sh), so the first open of a restored file gives it a new id; nothing here can be forgotten.
 */
function settleGeneration(db: DatabaseSync): void {
  if (metaValue(db, 'generation') && !metaValue(db, 'from_backup')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!metaValue(db, 'generation') || metaValue(db, 'from_backup')) writeGeneration(db);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const generationOf = (db: DatabaseSync): string => metaValue(db, 'generation')!;
/** By hand, for a database file put back without a backup (a pre-restore copy). */
export const newGeneration = (db: DatabaseSync): void => writeGeneration(db);
